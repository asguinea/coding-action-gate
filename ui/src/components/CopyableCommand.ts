import type { UiSuggestedCommand } from "../api/types.js";

export const createCopyableCommand = (
  suggestedCommand: UiSuggestedCommand
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "copyable-command";

  const label = document.createElement("div");
  label.className = "copyable-command-label";
  label.textContent = suggestedCommand.label;

  const command = document.createElement("code");
  command.textContent = suggestedCommand.command;

  wrapper.append(label, command);

  return wrapper;
};
