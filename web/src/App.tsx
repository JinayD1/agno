import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import HomeScreen from "./components/screens/HomeScreen";
import ReposScreen from "./components/screens/ReposScreen";
import RepoDetailScreen from "./components/screens/RepoDetailScreen";
import LiveFeedScreen from "./components/screens/LiveFeedScreen";
import ContextBoardScreen from "./components/screens/ContextBoardScreen";
import AgentsScreen from "./components/screens/AgentsScreen";
import SettingsScreen from "./components/screens/SettingsScreen";

export default function App() {
  return (
    <HashRouter>
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          background: "#0B0B0D",
          color: "#EDEDEF",
          fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          overflow: "hidden",
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/repos" element={<ReposScreen />} />
            <Route path="/repos/:repoId" element={<RepoDetailScreen />} />
            <Route path="/live" element={<LiveFeedScreen />} />
            <Route path="/context" element={<ContextBoardScreen />} />
            <Route path="/agents" element={<AgentsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            {/* Catch-all: any unknown URL falls back to Home so nothing ever
                lands on a blank white page. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
