import { Box, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        bgcolor: "grey.200",
        px: 3,
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography
          variant="h5"
          fontWeight={900}
          onClick={() => navigate("/")}
          sx={{ letterSpacing: -1, lineHeight: 1, cursor: "pointer" }}
        >
          CEX
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Customer Service Virtual Training
        </Typography>
      </Box>
    </Box>
  );
}
