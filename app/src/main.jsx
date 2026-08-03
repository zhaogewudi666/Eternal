import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { Widget } from "./Widget.jsx";
import "./styles.css";

function resolveSurface() {
  if (typeof window === "undefined") return "main";
  const params = new URLSearchParams(window.location.search);
  if (params.get("window") === "widget") return "widget";
  return "main";
}

const surface = resolveSurface();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {surface === "widget" ? <Widget /> : <App />}
  </React.StrictMode>,
);
