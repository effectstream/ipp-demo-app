import Foundation

// Schema-agnostic patient record. The form schema decides which questions
// exist and how to render them; this struct just stores answers by
// question id.
struct Patient: Codable, Identifiable, Hashable {
    var id: String
    var responses: [String: ResponseValue] = [:]
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    // Server-assigned 6-digit lookup code. Excluded from the canonical
    // hash so its presence/absence doesn't affect the on-chain anchor.
    var passcode: String? = nil

    init(
        id: String,
        responses: [String: ResponseValue] = [:],
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        passcode: String? = nil
    ) {
        self.id = id
        self.responses = responses
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.passcode = passcode
    }

    static func new() -> Patient {
        Patient(id: UUID().uuidString.lowercased())
    }

    func canonicalCopy() -> Patient {
        var c = self
        c.passcode = nil
        return c
    }

    // Tolerant decoder: missing/extra keys are ignored so the iOS app
    // keeps working when the schema and the stored record drift.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.responses = (try? c.decode([String: ResponseValue].self, forKey: .responses)) ?? [:]
        self.createdAt = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()
        self.updatedAt = (try? c.decode(Date.self, forKey: .updatedAt)) ?? Date()
        self.passcode = try? c.decode(String.self, forKey: .passcode)
    }
}

// Convenience accessors used by RootView and APIPatientStore - these
// happen to know which question ids encode identity / location, but
// they're tolerant when the schema doesn't include them.
extension Patient {
    var nombre: String { responses["nombre"]?.asText ?? "" }
    var rut: String { responses["rut"]?.asText ?? "" }
    var edad: Int? { responses["edad"]?.asInt }
    var latitude: Double? { responses["direccion"]?.asAddress?.latitud }
    var longitude: Double? { responses["direccion"]?.asAddress?.longitud }
}
