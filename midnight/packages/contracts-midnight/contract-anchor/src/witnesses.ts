export type AnchorPrivateState = {
  secretKey: Uint8Array;
};

export function createWitnesses(secretKey: Uint8Array) {
  return {
    private$secret_key(context: { privateState: AnchorPrivateState }): [AnchorPrivateState, Uint8Array] {
      return [context.privateState, secretKey];
    },
  };
}
