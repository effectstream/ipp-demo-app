import Foundation
import CryptoKit

// ed25519 signing identity for a doctor. Derived deterministically from the
// account's 32-byte secret seed, so the same account produces the same public
// key and signatures on every launch and on any device — and, because it's
// standard RFC 8032 ed25519, byte-identical to the web client's @noble key for
// the same seed. (A real signup flow would generate a random seed and stash it
// in the Keychain; the demo accounts ship fixed seeds, so derivation is enough.)
struct Wallet {
    private let privateKey: Curve25519.Signing.PrivateKey

    var publicKeyHex: String { privateKey.publicKey.rawRepresentation.hex }

    init(privateKey: Curve25519.Signing.PrivateKey) {
        self.privateKey = privateKey
    }

    init?(seedHex: String) {
        guard let seed = Data(hexString: seedHex), seed.count == 32,
              let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: seed) else {
            return nil
        }
        self.privateKey = key
    }

    func sign(_ data: Data) -> String {
        (try? privateKey.signature(for: data))?.hex ?? ""
    }
}

// Produces the X-IPP-* headers that authorize a doctor-scope request. The
// signed payload must match backend/src/auth.ts exactly:
//   `${METHOD}|${pathname}|${timestampMs}|${SHA-256(body)hex}`
struct DoctorSigner {
    let wallet: Wallet
    let username: String

    func headers(method: String, path: String, body: Data?) -> [String: String] {
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        let bodyHash = SHA256.hash(data: body ?? Data())
            .map { String(format: "%02x", $0) }.joined()
        let payload = "\(method)|\(path)|\(ts)|\(bodyHash)"
        return [
            "X-IPP-PubKey": wallet.publicKeyHex,
            "X-IPP-Timestamp": String(ts),
            "X-IPP-Signature": wallet.sign(Data(payload.utf8)),
            "X-IPP-Username": username,
        ]
    }
}

extension Data {
    var hex: String {
        map { String(format: "%02x", $0) }.joined()
    }

    init?(hexString: String) {
        let chars = Array(hexString)
        guard chars.count % 2 == 0 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(chars.count / 2)
        var i = 0
        while i < chars.count {
            guard let b = UInt8(String(chars[i ... i + 1]), radix: 16) else { return nil }
            bytes.append(b)
            i += 2
        }
        self = Data(bytes)
    }
}
