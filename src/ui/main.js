import canonicalTeams from "../../data/teams.json";
import identityMap from "../../data/player_identity_map.json";
import yahooPayload from "../../data/external/yahoo/players.json";
import { createDemoDraftInput, demoFixtureDescription } from "../demo/demo-state.js";
import { resolveDraftState } from "../domain/engine.js";
import { buildDraftBoardViewModel } from "../presentation/board-view-model.js";
import { renderDraftBoard } from "./render-board.js";
import "./styles.css";

const demoInput = createDemoDraftInput(canonicalTeams);
const resolvedState = resolveDraftState(demoInput);
const viewModel = buildDraftBoardViewModel({
  resolvedState,
  teams: demoInput.teams,
  identityMap,
  yahooPlayers: yahooPayload.players,
  stateLabel: demoFixtureDescription.label,
});

const root = document.querySelector("#app");
root.innerHTML = renderDraftBoard(viewModel);

document.querySelector("#team-jump")?.addEventListener("change", (event) => {
  const teamId = event.target.value;
  if (!teamId) return;
  document
    .querySelector(`[data-team-column="${CSS.escape(teamId)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
});

