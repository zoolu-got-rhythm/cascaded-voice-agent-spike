import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, IconButton } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import Header from "../components/Header";
import PageBreadcrumbs from "../components/PageBreadcrumbs";
import { scenarios } from "../data/scenarios";
import { LiveAvatarSession, SessionEvent, SessionState } from "@heygen/liveavatar-web-sdk";

const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY as string;
const HEYGEN_AVATAR_ID = import.meta.env.VITE_HEYGEN_AVATAR_ID as string;
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as string;
const CLAUDE_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string;

type TranscriptEntry =
    | { role: "user"; text: string; confidence: number }
    | { role: "avatar"; text: string };

type ClaudeMessage = { role: "user" | "assistant"; content: string };

async function fetchHeygenToken(): Promise<string> {
    const res = await fetch("https://api.liveavatar.com/v1/sessions/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HEYGEN_API_KEY },
        body: JSON.stringify({ avatar_id: HEYGEN_AVATAR_ID, mode: "CUSTOM", is_sandbox: true }),
    });
    if (!res.ok) throw new Error(`HeyGen token error: ${res.status}`);
    const { data } = await res.json();
    return data.session_token as string;
}

export default function ScenarioSession() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const scenario = scenarios.find((s) => s.id === id);

    const [isDone, setIsDone] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isPTT, setIsPTT] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const sessionRef = useRef<LiveAvatarSession | null>(null);
    const stopPromiseRef = useRef<Promise<void>>(Promise.resolve());
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const dgWsRef = useRef<WebSocket | null>(null);
    const pttBufferRef = useRef<{ text: string; confidence: number }[]>([]);
    const historyRef = useRef<ClaudeMessage[]>([]);

    // ── Claude API ────────────────────────────────────────────────────────────
    async function askClaude(userText: string): Promise<string | null> {
        if (!scenario) return null;
        const { persona } = scenario;
        const system =
            `You are ${persona.name}, a ${persona.age}-year-old customer in a retail game store. ` +
            `Your mood is ${persona.mood}. ${persona.context} ` +
            `Respond naturally and briefly as this customer (1-3 sentences). Stay in character.`;

        historyRef.current = [...historyRef.current, { role: "user", content: userText }];

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 150,
                system,
                messages: historyRef.current,
            }),
        });

        if (!res.ok) { console.error("Claude error:", res.status); return null; }
        const data = await res.json();
        const reply: string = data.content[0].text;
        historyRef.current = [...historyRef.current, { role: "assistant", content: reply }];
        return reply;
    }

    // ── Avatar speak helper ───────────────────────────────────────────────────
    function avatarSpeak(text: string) {
        setTranscript(prev => [...prev, { role: "avatar", text }]);
        sessionRef.current?.repeat(text);
    }

    // ── HeyGen session ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!scenario) return;
        let cancelled = false;
        let localSession: LiveAvatarSession | null = null;

        async function startAvatar() {
            await stopPromiseRef.current;
            if (cancelled) return;
            try {
                const token = await fetchHeygenToken();
                if (cancelled) return;

                const session = new LiveAvatarSession(token);
                localSession = session;
                sessionRef.current = session;

                // Patch: SDK WS handler doesn't support speak_text — route via WS with agent.* format
                const s = session as unknown as Record<string, unknown>;
                const origSend = (s.sendCommandEvent as (...a: unknown[]) => void).bind(session);
                s.sendCommandEvent = (cmd: { event_type: string; text?: string }) => {
                    if (cmd.event_type === "avatar.speak_text" || cmd.event_type === "avatar.speak_response") {
                        const ws = s._sessionEventSocket as WebSocket | null;
                        const eventId = crypto.randomUUID();
                        if (ws?.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: "agent.speak_text", text: cmd.text, event_id: eventId }));
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
                });

                session.on(SessionEvent.SESSION_STATE_CHANGED, async (state) => {
                    if (state === SessionState.CONNECTED) {
                        // Avatar opens the scenario with their opening line
                        const opening = await askClaude("(start the scenario — introduce yourself and your reason for visiting the store in one sentence)");
                        if (opening) avatarSpeak(opening);
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

    // ── Push-to-talk ──────────────────────────────────────────────────────────
    async function startPTT() {
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
            setIsPTT(true);
        };
    }

    async function stopPTT() {
        setIsPTT(false);
        mediaRecorderRef.current?.stop();
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;

        const ws = dgWsRef.current;
        dgWsRef.current = null;

        // Tell Deepgram we're done — it will flush remaining transcripts then close
        await new Promise<void>(resolve => {
            if (!ws || ws.readyState !== WebSocket.OPEN) { resolve(); return; }
            ws.onclose = () => resolve();
            ws.send(JSON.stringify({ type: "CloseStream" }));
            setTimeout(resolve, 1500); // fallback
        });
        ws?.close();

        const buffer = pttBufferRef.current;
        if (buffer.length === 0) return;

        buffer.forEach(e => setTranscript(prev => [...prev, { role: "user", ...e }]));
        const userText = buffer.map(e => e.text).join(" ");

        const reply = await askClaude(userText);
        if (reply) avatarSpeak(reply);
    }

    // ── Countdown timer ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!scenario) return;
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 1;
            if (elapsed >= scenario.durationMins * 60) { clearInterval(interval); setIsDone(true); }
        }, 1000);
        return () => clearInterval(interval);
    }, [scenario]);

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

                    {/* Avatar video */}
                    <Box sx={{ width: 280, height: 220, border: "1px solid", borderColor: "divider", bgcolor: "grey.900", flexShrink: 0, overflow: "hidden" }}>
                        <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

                    {/* Push-to-talk mic */}
                    <IconButton
                        size="large"
                        onMouseDown={startPTT}
                        onMouseUp={stopPTT}
                        onMouseLeave={() => { if (isPTT) stopPTT(); }}
                        onTouchStart={startPTT}
                        onTouchEnd={stopPTT}
                        sx={{
                            bgcolor: isPTT ? "error.main" : "action.selected",
                            "&:hover": { bgcolor: isPTT ? "error.dark" : "action.focus" },
                            userSelect: "none",
                        }}
                    >
                        <MicIcon sx={{ fontSize: 48, color: isPTT ? "white" : "text.primary" }} />
                    </IconButton>
                    <Typography variant="caption" color="text.disabled">
                        {isPTT ? "Listening…" : "Hold to talk"}
                    </Typography>

                    {/* Done button */}
                    <Button
                        variant="contained"
                        disabled={!isDone}
                        onClick={() => navigate("/")}
                        sx={{ mt: 1, bgcolor: isDone ? "primary.main" : undefined, minWidth: 140 }}
                    >
                        I'm done
                    </Button>
                </Box>

                {/* Transcript sidebar */}
                <Paper elevation={0} square sx={{ width: 280, borderLeft: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", overflowY: "auto" }}>
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
                                    <Typography key={i} variant="caption" display="block" sx={{
                                        color: entry.confidence >= 0.9 ? "success.main" : entry.confidence >= 0.7 ? "warning.main" : "error.main",
                                    }}>
                                        me: {entry.text} ({Math.round(entry.confidence * 100)}%)
                                    </Typography>
                                ) : (
                                    <Typography key={i} variant="caption" display="block" sx={{ color: "info.main" }}>
                                        {scenario.persona.name}: {entry.text}
                                    </Typography>
                                )
                            )
                        )}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}
