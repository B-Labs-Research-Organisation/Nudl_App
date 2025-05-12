import typia from "typia";
import { Users } from "./models";

export function Api(userStore: Users) {
  function getAddress(u: unknown) {
    const params = typia.assert<{ discordId: string; chainId: number, guildId: string }>(u);
    return userStore.getAddress(params.discordId, params.guildId, params.chainId);
  }
  function ping() {
    return "pong";
  }

  return {
    getAddress,
    ping,
  };
}
