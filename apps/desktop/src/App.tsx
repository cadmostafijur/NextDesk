import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Onboarding } from "./pages/Onboarding";
import { Home } from "./pages/Home";
import { Connect } from "./pages/Connect";
import { SessionView } from "./pages/SessionView";
import { FileTransfer } from "./pages/FileTransfer";
import { Recent } from "./pages/Recent";
import { Devices } from "./pages/Devices";
import { Security } from "./pages/Security";
import { Settings } from "./pages/Settings";
import { About } from "./pages/About";
import { IncomingModal } from "./components/IncomingModal";
import { bootstrapIdentity, connectSignaling } from "./lib/sessionController";
import { useAppStore } from "./lib/store";

export default function App() {
  const onboarded = useAppStore((s) => s.onboarded);
  const theme = useAppStore((s) => s.theme);
  const activeSession = useAppStore((s) => s.activeSession);

  useEffect(() => {
    void (async () => {
      await bootstrapIdentity();
      const st = useAppStore.getState();
      if (st.onboarded) {
        try {
          await connectSignaling();
        } catch {
          // Home and the sidebar explain the offline state; no banner needed here.
          st.set({ signalingConnected: false, presence: "offline" });
        }
      }
    })();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && preferDark);
    root.classList.toggle("dark", dark);
  }, [theme]);

  if (!onboarded) {
    return <Onboarding />;
  }

  if (activeSession) {
    return (
      <>
        <SessionView />
        <IncomingModal />
      </>
    );
  }

  return (
    <>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/files" element={<FileTransfer />} />
          <Route path="/recent" element={<Recent />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/security" element={<Security />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <IncomingModal />
    </>
  );
}
