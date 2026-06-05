import { MidnightAdapter } from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { Anchor, createWitnesses } from "@ipp/midnight-contract";

// The batcher's seed — its public key is the deployer of the anchor contract,
// so only this seed can append entries to the anchors Map.
// IMPORTANT: must match deploy.ts's DEPLOYER_SECRET_KEY[31] = 0x01.
const BATCHER_SECRET_KEY = new Uint8Array(32);
BATCHER_SECRET_KEY[31] = 0x01;
const witnesses = createWitnesses(BATCHER_SECRET_KEY);

export interface MidnightBalancingEnv {
  networkId?: string;
  syncProtocolName: string;
}

function getMidnightContractData(networkId: string) {
  const data = readMidnightContract("contract-anchor", { networkId });
  if (!data.contractAddress) {
    throw new Error(`Midnight contract address not found for networkId=${networkId}`);
  }
  return data;
}

export function createMidnightBalancingAdapter(env: MidnightBalancingEnv) {
  const networkId = env.networkId ?? midnightNetworkConfig.id;
  const contractData = getMidnightContractData(networkId);

  return new MidnightAdapter(
    contractData.contractAddress,
    midnightNetworkConfig.walletSeed!,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath: contractData.zkConfigPath,
      privateStateStoreName: "anchor-private-state",
      privateStateId: "anchorPrivateState",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: networkId,
    },
    // The batcher-sdk MidnightAdapter passes contractClass into
    // CompiledContract.make, which later calls `new ctor(witnesses)`. So we
    // pass the *class*, not an instance — the upstream template's
    // `new Anchor.Contract(witnesses)` here is a bug.
    Anchor.Contract,
    witnesses,
    contractData.contractInfo,
    env.syncProtocolName,
  );
}
