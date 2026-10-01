import "@/App.css";
import { useLenis } from "@/hooks/useLenis";
import { useCursorGlow } from "@/hooks/useCursorGlow";
import Landing from "@/components/Landing";

function App() {
  useLenis();
  useCursorGlow();
  return (
    <div className="App grain">
      <div className="cursor-glow" aria-hidden="true" />
      <Landing />
    </div>
  );
}

export default App;
