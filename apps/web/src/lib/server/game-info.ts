import "server-only";
import { gameInfoExampleMode, gameInfoExamples } from "../game-info-examples";

export function getGameInfoRecords() {
  return gameInfoExamples(gameInfoExampleMode(process.env.GAME_INFO_EXAMPLES));
}
