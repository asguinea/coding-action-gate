export const createLayout = (content: HTMLElement): HTMLElement => {
  const root = document.createElement("main");
  root.className = "app-shell";

  const header = document.createElement("header");
  header.className = "app-header";

  const title = document.createElement("h1");
  title.textContent = "CodingActionGate";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Runtime authorization layer for agentic coding";

  header.append(title, subtitle);
  root.append(header, content);

  return root;
};
