import Foundation

// Mock Cardano-style address derivation. Mirrors web/src/session.ts exactly
// (two-stream FNV-1a hash with the same seeds) so iOS and web produce
// identical addresses for the same input. Replace with CIP-1852 + bech32
// when real wallet support lands.
enum CardanoWallet {
    static func mockAddress(for seed: String) -> String {
        let h = fnv1aHex(seed, length: 24)
        let h2 = fnv1aHex("\(seed):2", length: 24)
        return "addr1q\(h)\(h2)"
    }

    static func shortAddress(_ addr: String) -> String {
        guard addr.count > 16 else { return addr }
        let head = String(addr.prefix(9))
        let tail = String(addr.suffix(6))
        return "\(head)…\(tail)"
    }

    private static func fnv1aHex(_ s: String, length hexLen: Int) -> String {
        var h1: UInt32 = 0x811c9dc5
        var h2: UInt32 = 0x84222325
        let bytes = Array(s.utf8)
        let n = bytes.count
        for i in 0..<n {
            h1 ^= UInt32(bytes[i])
            h1 = h1 &* 0x01000193
            h2 ^= UInt32(bytes[n - 1 - i])
            h2 = h2 &* 0x01000193
        }
        var out = String(format: "%08x", h1) + String(format: "%08x", h2)
        while out.count < hexLen {
            out += fnv1aHex(out, length: 8)
        }
        return String(out.prefix(hexLen))
    }
}
