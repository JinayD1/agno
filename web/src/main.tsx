import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
// Side-effect: in live mode this registers Workstream A's repo into the shared
// list before any screen renders (see api/orbitApi.ts).
import "./api";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
