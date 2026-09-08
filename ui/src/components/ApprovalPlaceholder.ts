export const createApprovalPlaceholder = (): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "approval-placeholder";

  const controls = document.createElement("div");
  controls.className = "approval-controls";

  const approve = document.createElement("button");
  approve.type = "button";
  approve.disabled = true;
  approve.textContent = "Approve";

  const reject = document.createElement("button");
  reject.type = "button";
  reject.disabled = true;
  reject.textContent = "Reject";

  controls.append(approve, reject);

  const note = document.createElement("p");
  note.className = "card-secondary";
  note.textContent = "Approval enforcement is not implemented in this UI yet.";

  wrapper.append(controls, note);

  return wrapper;
};
