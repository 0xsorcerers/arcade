import "@/App.css";
import "@/pages/StakingTheme.css";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useLenis } from "@/hooks/useLenis";
import { useCursorGlow } from "@/hooks/useCursorGlow";
import Landing from "@/components/Landing";
import Staking from "@/pages/Staking.tsx";

function AppRoutes() {
  useLenis();
  useCursorGlow();
  const location = useLocation();
  const isStakingRoute = location.pathname.replace(/\/+$/, "") === "/staking";
  return (
    <div className={`App grain${isStakingRoute ? " staking-app" : ""}`}>
      <div className="cursor-glow" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/staking" element={<Staking />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
