import { Typography } from "@mui/material";
import { useCountdown } from "../hooks/useCountdown";

interface CountdownClockProps {
    durationSecs: number;
    onTimeOver: () => void;
}

function formatTime(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

export default function CountdownClock({ durationSecs, onTimeOver }: CountdownClockProps) {
    const remaining = useCountdown(durationSecs, onTimeOver);
    const isLow = remaining <= 30;

    return (
        <Typography
            variant="h6"
            fontFamily="monospace"
            color={isLow ? "error.main" : "text.primary"}
        >
            {formatTime(remaining)}
        </Typography>
    );
}
