import Foundation
import CryptoKit

enum PatientHasher {
    // Stable, sorted-key JSON encoding so a re-hash of the same content
    // produces the same digest across runs and platforms.
    static func canonicalJSON(_ patient: Patient) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(patient.canonicalCopy())
    }

    static func sha256Hex(_ patient: Patient) throws -> String {
        let json = try canonicalJSON(patient)
        let digest = SHA256.hash(data: json)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
