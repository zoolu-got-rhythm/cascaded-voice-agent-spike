import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, IconButton, CircularProgress, Skeleton } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import StopIcon from "@mui/icons-material/Stop";
import Header from "../components/Header";
import PageBreadcrumbs from "../components/PageBreadcrumbs";
import CountdownClock from "../components/CountdownClock";
import TranscriptBubble from "../components/TranscriptBubble";
import { scenarios, type Scenario } from "../data/scenarios";
import { LiveAvatarSession, SessionEvent, SessionState, AgentEventsEnum } from "@heygen/liveavatar-web-sdk";

const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY as string;
const HEYGEN_AVATAR_ID = import.meta.env.VITE_HEYGEN_AVATAR_ID as string;
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as string;

type TranscriptEntry =
    | { role: "user"; text: string; confidence: number }
    | { role: "avatar"; text: string };

async function fetchHeygenToken(scenario: Scenario): Promise<string> {
    const { persona } = scenario;
    const res = await fetch("https://api.liveavatar.com/v1/sessions/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HEYGEN_API_KEY },
        body: JSON.stringify({
            avatar_id: HEYGEN_AVATAR_ID,
            mode: "FULL",
            is_sandbox: true,
            avatar_persona: {
                persona_prompt:
                    `You are ${persona.name}, a ${persona.age}-year-old customer in a retail game store. ` +
                    `Your mood is ${persona.mood}. ${persona.context} ` +
                    `Respond naturally and briefly as this customer (1-3 sentences). Stay in character.`,
            },
        }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        console.error("HeyGen token error:", res.status, JSON.stringify(body, null, 2));
        throw new Error(`HeyGen token error: ${res.status}`);
    }
    const { data } = await res.json();
    return data.session_token as string;
}

export default function ScenarioSession() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const scenario = scenarios.find((s) => s.id === id);

    const [isDone, setIsDone] = useState(false);
    const [isAvatarReady, setIsAvatarReady] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [showListening, setShowListening] = useState(false);
    const [isAvatarTalking, setIsAvatarTalking] = useState(true);
    const [isPendingResponse, setIsPendingResponse] = useState(false);
    const [isRetry, setIsRetry] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const sessionRef = useRef<LiveAvatarSession | null>(null);
    const stopPromiseRef = useRef<Promise<void>>(Promise.resolve());
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const dgWsRef = useRef<WebSocket | null>(null);
    const pttBufferRef = useRef<{ text: string; confidence: number }[]>([]);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const listenDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isListeningRef = useRef(false);
    const isAvatarTalkingRef = useRef(true);
    const isAvatarReadyRef = useRef(false);
    const isPendingResponseRef = useRef(false);

    // ── HeyGen session ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!scenario) return;
        let cancelled = false;
        let localSession: LiveAvatarSession | null = null;

        async function startAvatar() {
            await stopPromiseRef.current;
            if (cancelled) return;
            try {
                const token = await fetchHeygenToken(scenario!);
                if (cancelled) return;

                const session = new LiveAvatarSession(token);
                localSession = session;
                sessionRef.current = session;

                // Patch: SDK WS handler is missing avatar.speak_text — send as agent.speak_text.
                // avatar.speak_response (message()) is left to go via LiveKit so FULL-mode LLM handles it.
                const s = session as unknown as Record<string, unknown>;
                const origSend = (s.sendCommandEvent as (...a: unknown[]) => void).bind(session);
                s.sendCommandEvent = (cmd: { event_type: string; text?: string }) => {
                    const wsTypeMap: Record<string, string> = {
                        "avatar.speak_text": "agent.speak_text",      // repeat() — avatar speaks text directly
                        "avatar.speak_response": "agent.user_input",   // message() — user input to FULL-mode LLM
                    };
                    const wsType = wsTypeMap[cmd.event_type];
                    if (wsType) {
                        const ws = s._sessionEventSocket as WebSocket | null;
                        const eventId = crypto.randomUUID();
                        if (ws?.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: wsType, text: cmd.text, event_id: eventId }));
                        } else {
                            const room = s.room as { state: string; localParticipant: { publishData: (d: Uint8Array, o: object) => void } };
                            if (room?.state === "connected") {
                                room.localParticipant.publishData(
                                    new TextEncoder().encode(JSON.stringify({ ...cmd, event_id: eventId })),
                                    { reliable: true, topic: "agent-control" },
                                );
                            }
                        }
                    } else {
                        origSend(cmd);
                    }
                };

                session.on(SessionEvent.SESSION_STREAM_READY, () => {
                    if (videoRef.current) session.attach(videoRef.current);
                    isAvatarReadyRef.current = true;
                    setIsAvatarReady(true);
                });

                // Capture avatar's spoken text for transcript
                session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event) => {
                    setTranscript(prev => [...prev, { role: "avatar", text: event.text }]);
                });

                session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
                    isPendingResponseRef.current = false;
                    setIsPendingResponse(false);
                    isAvatarTalkingRef.current = true;
                    setIsAvatarTalking(true);
                    stopListening();
                });

                session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
                    isAvatarTalkingRef.current = false;
                    setIsAvatarTalking(false);
                    startListening();
                });

                session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
                    if (state === SessionState.CONNECTED) {
                        const { persona } = scenario!;
                        const facts = persona.implicitFacts.map((f, i) => `${i + 1}. ${f}`).join(" ");
                        session.message(
                            `You are ${persona.name}, a ${persona.age}-year-old customer. ` +
                            `Your mood is ${persona.mood}. ${persona.context} ` +
                            `You also have the following private knowledge that you must NEVER volunteer unprompted — only reveal each fact if the assistant directly asks: ${facts} ` +
                            `Please introduce yourself to the store assistant in one sentence, in character.`
                        );
                    }
                });

                await session.start();
                if (cancelled) { localSession.stop().catch(() => {}); sessionRef.current = null; }
            } catch (err) {
                console.error("LiveAvatar error:", err);
            }
        }

        const startPromise = startAvatar();
        return () => {
            cancelled = true;
            stopPromiseRef.current = startPromise.then(async () => {
                if (localSession) {
                    await localSession.stop().catch(() => {});
                    await new Promise<void>(r => setTimeout(r, 800));
                }
            });
            sessionRef.current = null;
        };
    }, [scenario]);  // eslint-disable-line react-hooks/exhaustive-deps

    // ── Click-to-talk ─────────────────────────────────────────────────────────
    function playBeep(frequency: number) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    }

    async function startListening() {
        if (isListeningRef.current) return;
        isListeningRef.current = true;
        setIsRetry(false);
        setIsListening(true);
        pttBufferRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ws = new WebSocket(
            "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&interim_results=false",
            ["token", DEEPGRAM_API_KEY],
        );
        dgWsRef.current = ws;

        ws.onmessage = (event) => {
            const alt = JSON.parse(event.data as string)?.channel?.alternatives?.[0];
            if (alt?.transcript) pttBufferRef.current.push({ text: alt.transcript, confidence: alt.confidence ?? 1 });
        };

        ws.onopen = () => {
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (e) => { if (ws.readyState === WebSocket.OPEN) ws.send(e.data); };
            recorder.start(250);
        };

        listenDelayRef.current = setTimeout(() => {
            setShowListening(true);
            playBeep(660);
        }, 500);
    }

    async function stopListening() {
        if (!isListeningRef.current) return;
        isListeningRef.current = false;
        // Lock the mic immediately — before any async work
        isPendingResponseRef.current = true;
        setIsPendingResponse(true);
        if (listenDelayRef.current) { clearTimeout(listenDelayRef.current); listenDelayRef.current = null; }
        setIsListening(false);
        setShowListening(false);

        mediaRecorderRef.current?.stop();
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;

        const ws = dgWsRef.current;
        dgWsRef.current = null;

        await new Promise<void>(resolve => {
            if (!ws || ws.readyState !== WebSocket.OPEN) { resolve(); return; }
            ws.onclose = () => resolve();
            ws.send(JSON.stringify({ type: "CloseStream" }));
            setTimeout(resolve, 1500);
        });
        ws?.close();

        const buffer = pttBufferRef.current;
        if (buffer.length === 0) {
            isPendingResponseRef.current = false;
            setIsPendingResponse(false);
            setIsRetry(true);
            return;
        }
        buffer.forEach(e => setTranscript(prev => [...prev, { role: "user", ...e }]));
        const userText = buffer.map(e => e.text).join(" ");

        if (!scenario) return;
        const { persona } = scenario;
        const facts = persona.implicitFacts.map((f, i) => `${i + 1}. ${f}`).join(" ");
        sessionRef.current?.message(
            `You are ${persona.name}, a ${persona.age}-year-old customer. ` +
            `Your mood is ${persona.mood}. ${persona.context} ` +
            `Private knowledge — only reveal if directly asked: ${facts} ` +
            `The store assistant just said: "${userText}". ` +
            `Respond as ${persona.name} in 1-2 sentences, in character.`
        );
    }

    function handleMicClick() {
        if (isAvatarTalkingRef.current || !isAvatarReadyRef.current || isPendingResponseRef.current) return;
        if (isListeningRef.current) stopListening();
        else startListening();
    }

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    if (!scenario) {
        return (
            <Box sx={{ p: 4 }}>
                <Typography>Scenario not found.</Typography>
                <Button onClick={() => navigate("/")}>Back</Button>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
            <Header />
            <PageBreadcrumbs crumbs={[{ label: "training scenario", to: "/" }, { label: scenario.title }]} />

            <Box sx={{ display: "flex", height: "calc(100vh - 96px)" }}>
                {/* Centre panel */}
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", p: 4, gap: 3, overflowY: "auto" }}>

                    {/* Countdown clock — only shown once avatar is ready */}
                    {isAvatarReady ? (
                        <CountdownClock
                            durationSecs={scenario.durationMins * 60}
                            onTimeOver={() => setIsDone(true)}
                        />
                    ) : (
                        <Skeleton variant="text" width={80} height={40} />
                    )}

                    {/* Avatar video */}
                    <Box sx={{ position: "relative", width: 280, height: 220, border: "1px solid", borderColor: "divider", bgcolor: "grey.900", flexShrink: 0, overflow: "hidden" }}>
                        <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        {!isAvatarReady && (
                            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <CircularProgress />
                            </Box>
                        )}
                    </Box>

                    {/* Persona info */}
                    <Box sx={{ display: "flex", gap: 4 }}>
                        <Typography variant="body2"><strong>Persona:</strong> {scenario.persona.name}</Typography>
                        <Typography variant="body2"><strong>age:</strong> {scenario.persona.age}</Typography>
                        <Typography variant="body2"><strong>mood:</strong> {scenario.persona.mood}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ maxWidth: 340, textAlign: "center" }}>
                        <strong>context:</strong> {scenario.persona.context}
                    </Typography>

                    {/* Click-to-stop mic */}
                    <IconButton
                        size="large"
                        onClick={handleMicClick}
                        disabled={isAvatarTalking || !isAvatarReady || isPendingResponse}
                        sx={{
                            bgcolor: (isAvatarTalking || !isAvatarReady || isPendingResponse) ? "action.disabledBackground" : isListening ? "error.main" : "action.selected",
                            "&:hover": { bgcolor: isListening ? "error.dark" : "action.focus" },
                        }}
                    >
                        {(isAvatarTalking || !isAvatarReady || isPendingResponse)
                            ? <MicOffIcon sx={{ fontSize: 48 }} />
                            : isListening && !showListening
                                ? <CircularProgress size={32} sx={{ color: "white" }} />
                                : isListening
                                    ? <StopIcon sx={{ fontSize: 48, color: "white" }} />
                                    : <MicIcon sx={{ fontSize: 48, color: "text.primary" }} />
                        }
                    </IconButton>
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={showListening ? {
                            animation: "listenPulse 4s ease-in-out infinite",
                            "@keyframes listenPulse": {
                                "0%":   { opacity: 1 },
                                "10%":  { opacity: 0.15 },
                                "20%":  { opacity: 1 },
                                "30%":  { opacity: 0.15 },
                                "40%":  { opacity: 1 },
                                "100%": { opacity: 1 },
                            },
                        } : undefined}
                    >
                        {!isAvatarReady ? "Avatar is loading…" : isAvatarTalking ? "Avatar is talking…" : showListening ? "🎙 Listening… (click to stop)" : isRetry ? "Retry" : ""}
                    </Typography>

                    {isDone && !isListening && (
                        <Button
                            variant="contained"
                            onClick={() => navigate("/")}
                            sx={{ mt: 1, minWidth: 140 }}
                        >
                            I'm done
                        </Button>
                    )}
                </Box>

                {/* Transcript sidebar */}
                <Paper elevation={0} square sx={{ width: 340, borderLeft: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                    <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Typography variant="body2" fontWeight={600}>Transcript</Typography>
                    </Box>
                    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                        {transcript.length === 0 ? (
                            <Typography variant="caption" color="text.disabled">
                                Transcript will appear here as the conversation progresses.
                            </Typography>
                        ) : (
                            transcript.map((entry, i) =>
                                entry.role === "user" ? (
                                    <TranscriptBubble key={i} name="me" text={entry.text} align="right" confidence={entry.confidence} />
                                ) : (
                                    <TranscriptBubble key={i} name={scenario.persona.name} text={entry.text} align="left" />
                                )
                            )
                        )}
                        <div ref={transcriptEndRef} />
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}
