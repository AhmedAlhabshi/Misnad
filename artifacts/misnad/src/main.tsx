import { createRoot } from "react-dom/client";
import App from "./App";
import AppV2 from "./v2/AppV2";
import { UI_VERSION } from "./uiVersion";
import "./index.css";

const RootApp = UI_VERSION === "v1" ? App : AppV2;

createRoot(document.getElementById("root")!).render(<RootApp />);
