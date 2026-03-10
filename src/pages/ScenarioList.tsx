import { useNavigate } from "react-router-dom";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import Header from "../components/Header";
import PageBreadcrumbs from "../components/PageBreadcrumbs";
import { scenarios } from "../data/scenarios";

export default function ScenarioList() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />

      <PageBreadcrumbs crumbs={[{ label: "training scenario" }]} />

      <List disablePadding>
        {scenarios.map((scenario) => (
          <ListItemButton
            key={scenario.id}
            onClick={() => navigate(`/scenario/${scenario.id}`)}
            divider
            sx={{ py: 1.5, px: 3 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <AccessTimeIcon fontSize="small" color="action" />
            </ListItemIcon>

            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography component="span" fontWeight={700} variant="body2">
                    {scenario.durationMins}mins
                  </Typography>
                  <Typography component="span" variant="body2">
                    {scenario.title}
                  </Typography>
                </Box>
              }
            />

            {scenario.score !== undefined ? (
              <Chip
                label={`${scenario.score}/100`}
                size="small"
                variant="outlined"
                sx={{ ml: 2, fontWeight: 600 }}
              />
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ ml: 2 }}>
                • • •
              </Typography>
            )}
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
