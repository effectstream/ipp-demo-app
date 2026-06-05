import Foundation
import CryptoKit

// In-memory ed25519 wallet. A fresh keypair is generated every app launch —
// nothing is persisted to Keychain. This matches the MVP "transparent for the
// user" model: the iOS client signs hash submissions so the EffectStream
// backend can verify them, but we don't try to give the doctor a long-lived
// blockchain identity (yet).
final class Wallet {
    static let shared = Wallet()

    private let privateKey: Curve25519.Signing.PrivateKey

    var publicKeyHex: String { privateKey.publicKey.rawRepresentation.hex }

    private init() {
        privateKey = Curve25519.Signing.PrivateKey()
    }

    func sign(_ data: Data) -> String {
        let sig = try! privateKey.signature(for: data)
        return sig.hex
    }
}

extension Data {
    var hex: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
