import typia from 'typia';
import { User } from './models';

export function Api() {
  const userStore = User();

  function getAddress(u: unknown) {
    const params = typia.assert<{ discordId: string; chainId: number }>(u);
    return userStore.getAddress(params.discordId, params.chainId);
  }
  function ping(){
    return 'pong'
  }

  return {
    getAddress,
    ping,
  };
}
