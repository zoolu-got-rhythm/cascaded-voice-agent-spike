import { BrowserRouter, Routes, Route } from "react-router-dom";
import { createTheme, ThemeProvider, CssBaseline } from "@mui/material";
import ScenarioList from "./pages/ScenarioList";
import ScenarioSession from "./pages/ScenarioSession";

const theme = createTheme({
  palette: {
    mode: "light",
  },
  typography: {
    fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ScenarioList />} />
          <Route path="/scenario/:id" element={<ScenarioSession />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
