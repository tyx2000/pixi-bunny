import { requireElement } from "./dom-controls.js";
import { formatProjectHistoryTime } from "./formatting.js";

export function createProjectHistoryPanel({ onExport, onRestore }) {
  const list = requireElement("project-history-list", HTMLDivElement);

  const handleClick = (event) => {
    const target =
      event.target instanceof Element ? event.target : event.target?.parentElement || null;
    const button = target?.closest("[data-history-action][data-history-id]");

    if (!button) {
      return;
    }

    const entryId = Number(button.dataset.historyId);

    if (button.dataset.historyAction === "export") {
      onExport(entryId);
      return;
    }

    onRestore(entryId);
  };

  list.addEventListener("click", handleClick);

  return {
    node: requireElement("project-history-panel", HTMLDivElement),
    destroy() {
      list.removeEventListener("click", handleClick);
    },
    render(history, activeEntryId = null) {
      list.replaceChildren();

      if (history.length === 0) {
        const empty = document.createElement("p");

        empty.className = "project-history-empty";
        empty.textContent = "暂无保存记录";
        list.append(empty);
        return;
      }

      history
        .slice()
        .sort((a, b) => b.savedAt - a.savedAt)
        .forEach((entry) => {
          const item = document.createElement("div");
          const time = document.createElement("span");
          const actions = document.createElement("div");
          const restoreButton = document.createElement("button");
          const exportButton = document.createElement("button");

          item.className = "project-history-item";
          item.dataset.historyId = String(entry.id);
          item.dataset.active = entry.id === activeEntryId ? "true" : "false";
          time.className = "project-history-time";
          time.textContent = formatProjectHistoryTime(entry.savedAt);
          actions.className = "project-history-actions";
          restoreButton.type = "button";
          restoreButton.textContent = "回溯";
          restoreButton.dataset.historyAction = "restore";
          restoreButton.dataset.historyId = String(entry.id);
          exportButton.type = "button";
          exportButton.textContent = "导出";
          exportButton.dataset.historyAction = "export";
          exportButton.dataset.historyId = String(entry.id);
          actions.append(restoreButton, exportButton);
          item.append(time, actions);
          list.append(item);
        });
    },
  };
}
