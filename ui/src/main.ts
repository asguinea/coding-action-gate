import "./styles.css";
import { renderApp } from "./App.js";

const mount = document.querySelector<HTMLElement>("#app");

if (mount === null) {
  throw new Error("Missing #app mount element.");
}

void renderApp(mount);
