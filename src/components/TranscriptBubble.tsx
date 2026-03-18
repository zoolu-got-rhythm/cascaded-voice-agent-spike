import { Box, Typography } from "@mui/material";

interface TranscriptBubbleProps {
    name: string;
    text: string;
    align: "left" | "right";
    confidence?: number;
}

function confidenceColor(confidence: number): string {
    if (confidence >= 0.9) return "#4caf50";
    if (confidence >= 0.7) return "#ff9800";
    return "#f44336";
}

export default function TranscriptBubble({ name, text, align, confidence }: TranscriptBubbleProps) {
    const isRight = align === "right";

    const nameBox = (
        <Box sx={{ bgcolor: "grey.300", borderRadius: 1, px: 0.75, py: 0.5, flexShrink: 0 }}>
            <Typography variant="caption" fontWeight={600}>{name}</Typography>
        </Box>
    );

    const bubble = (
        <Box sx={{
            width: "60%",
            bgcolor: "grey.200",
            borderRadius: isRight ? "12px 12px 0 12px" : "12px 12px 12px 0",
            px: 1.25,
            pt: 0.75,
            pb: confidence !== undefined ? 0.5 : 0.75,
            overflow: "hidden",
        }}>
            <Typography variant="caption" sx={{ color: isRight ? "grey.800" : "info.main" }}>
                {text}
            </Typography>
            {confidence !== undefined && (
                <Box sx={{ mt: 0.75, height: 4, bgcolor: "grey.300", borderRadius: 2, overflow: "hidden", border: "1px solid white" }}>
                    <Box sx={{
                        width: `${Math.round(confidence * 100)}%`,
                        height: "100%",
                        bgcolor: confidenceColor(confidence),
                        borderRadius: 2,
                    }} />
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: isRight ? "flex-end" : "flex-start", gap: 0.75 }}>
            {isRight ? <>{bubble}{nameBox}</> : <>{nameBox}{bubble}</>}
        </Box>
    );
}
