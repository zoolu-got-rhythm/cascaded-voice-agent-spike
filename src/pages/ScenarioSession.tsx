import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, IconButton } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import Header from "../components/Header";
import PageBreadcrumbs from "../components/PageBreadcrumbs";
import { scenarios } from "../data/scenarios";

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as string;

export default function ScenarioSession() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const scenario = scenarios.find((s) => s.id === id);

    const [isDone, setIsDone] = useState(false);
    const [transcript, setTranscript] = useState<string[]>([]);
    const [isListening, setIsListening] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    async function startListening() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const ws = new WebSocket(
            "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&interim_results=false",
            ["token", DEEPGRAM_API_KEY],
        );
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data as string);
            const text: string = data?.channel?.alternatives?.[0]?.transcript;
            if (text) setTranscript(prev => [...prev, text]);
        };

        ws.onopen = () => {
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
            };
            recorder.start(250);
            setIsListening(true);
        };
    }

    function stopListening() {
        mediaRecorderRef.current?.stop();
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        wsRef.current?.close();
        wsRef.current = null;
        setIsListening(false);
    }

    function toggleMic() {
        isListening ? stopListening() : startListening();
    }

    // Countdown timer — navigates home and marks done when time expires
    useEffect(() => {
        if (!scenario) return;
        const totalSeconds = scenario.durationMins * 60;
        let elapsed = 0;

        const interval = setInterval(() => {
            elapsed += 1;
            if (elapsed >= totalSeconds) {
                clearInterval(interval);
                setIsDone(true);
            }
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

            <PageBreadcrumbs
                crumbs={[
                    { label: "training scenario", to: "/" },
                    { label: scenario.title },
                ]}
            />

            {/* Main layout */}
            <Box sx={{ display: "flex", height: "calc(100vh - 96px)" }}>
                {/* Centre panel */}
                <Box
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        p: 4,
                        gap: 3,
                        overflowY: "auto",
                    }}
                >
                    {/* Persona image placeholder */}
                    <Box
                        sx={{
                            width: 280,
                            height: 220,
                            border: "1px solid",
                            borderColor: "divider",
                            position: "relative",
                            bgcolor: "grey.100",
                            flexShrink: 0,
                        }}
                    />

                    {/* Persona info */}
                    <Box sx={{ display: "flex", gap: 4 }}>
                        <Typography variant="body2">
                            <strong>Persona:</strong> {scenario.persona.name}
                        </Typography>
                        <Typography variant="body2">
                            <strong>age:</strong> {scenario.persona.age}
                        </Typography>
                        <Typography variant="body2">
                            <strong>mood:</strong> {scenario.persona.mood}
                        </Typography>
                    </Box>

                    <Typography
                        variant="body2"
                        sx={{ maxWidth: 340, textAlign: "center" }}
                    >
                        <strong>context:</strong> {scenario.persona.context}
                    </Typography>


                    {/* Mic */}
                    <IconButton
                        size="large"
                        onClick={toggleMic}
                        sx={{
                            bgcolor: isListening ? "error.main" : "action.selected",
                            "&:hover": { bgcolor: isListening ? "error.dark" : "action.focus" },
                        }}
                    >
                        <MicIcon sx={{ fontSize: 48, color: isListening ? "white" : "text.primary" }} />
                    </IconButton>

                    {/* Done button */}
                    <Button
                        variant="contained"
                        disabled={!isDone}
                        onClick={() => navigate("/")}
                        sx={{
                            mt: 1,
                            bgcolor: isDone ? "primary.main" : undefined,
                            minWidth: 140,
                        }}
                    >
                        I'm done
                    </Button>

                    {!isDone && (
                        <Typography variant="caption" color="text.disabled">
                            Button enables when conversation is complete or time
                            expires
                        </Typography>
                    )}
                </Box>

                {/* Transcript sidebar */}
                <Paper
                    elevation={0}
                    square
                    sx={{
                        width: 280,
                        borderLeft: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        flexDirection: "column",
                        overflowY: "auto",
                    }}
                >
                    <Box
                        sx={{
                            p: 2,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <Typography variant="body2" fontWeight={600}>
                            Transcript
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            p: 2,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                        }}
                    >
                        {transcript.length === 0 ? (
                            <Typography variant="caption" color="text.disabled">
                                Transcript will appear here as the conversation
                                progresses.
                            </Typography>
                        ) : (
                            transcript.map((line, i) => (
                                <Typography
                                    key={i}
                                    variant="caption"
                                    display="block"
                                >
                                    {line}
                                </Typography>
                            ))
                        )}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}
