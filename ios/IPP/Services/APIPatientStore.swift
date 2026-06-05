import Foundation

// HTTP-backed PatientStore. Reads/writes the full Patient record via the
// IPP backend, which persists to Neon Postgres. The backend extracts id, RUT
// and coords for indexing; the full record lives in a JSONB column.
final class APIPatientStore: PatientStore {
    let baseURL: URL
    /// Closure returning the current doctor name (or nil). Read lazily so a
    /// rename via the leaderboard UI takes effect on the next save.
    var doctorNameProvider: () -> String? = { nil }

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(baseURL: URL) { self.baseURL = baseURL }

    func fetchLeaderboard() async throws -> [LeaderboardEntry] {
        let res: LeaderboardResponse = try await get("api/v1/leaderboard")
        return res.entries
    }

    func list() async throws -> [Patient] {
        let res: ListResponse = try await get("api/v1/patients")
        return res.patients.map { $0.toPatient() }
    }

    func get(id: String) async throws -> Patient? {
        do {
            let envelope: PatientEnvelope = try await get("api/v1/patients/\(id)")
            return envelope.toPatient()
        } catch APIError.httpStatus(404, _) {
            return nil
        }
    }

    func save(_ patient: Patient) async throws -> Patient {
        var p = patient
        p.updatedAt = Date()
        // Send the canonical (passcode-stripped) copy in `data` so the
        // hash-anchor path computes the same digest server-side later.
        let body = UpsertRequest(
            id: p.id,
            rut: p.rut,
            doctorName: doctorNameProvider(),
            latitude: p.latitude,
            longitude: p.longitude,
            data: p.canonicalCopy()
        )
        let envelope: PatientEnvelope = try await post("api/v1/patients", body: body)
        return envelope.toPatient()
    }

    func delete(id: String) async throws {
        try await sendDelete("api/v1/patients/\(id)")
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "GET"
        return try await send(req)
    }

    private func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try encoder.encode(body)
        return try await send(req)
    }

    private func sendDelete(_ path: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "DELETE"
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.malformedResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.httpStatus(http.statusCode, "")
        }
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.malformedResponse }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpStatus(http.statusCode, body)
        }
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Wire formats

private struct UpsertRequest: Encodable {
    let id: String
    let rut: String
    let doctorName: String?
    let latitude: Double?
    let longitude: Double?
    let data: Patient
}

private struct ListResponse: Decodable {
    let patients: [PatientEnvelope]
}

private struct PatientEnvelope: Decodable {
    let id: String
    let rut: String
    // Plaintext passcode is only present in the POST response for a brand-new
    // patient (shown once). Reads/lookup no longer return it.
    let passcode: String?
    let latitude: Double?
    let longitude: Double?
    let data: Patient

    func toPatient() -> Patient {
        var p = data
        p.passcode = passcode
        // Keep the server's identity in case the JSON inside `data` somehow drifted.
        p.id = id
        return p
    }
}

enum APIError: Error, LocalizedError {
    case malformedResponse
    case httpStatus(Int, String)

    var errorDescription: String? {
        switch self {
        case .malformedResponse: return "Respuesta del servidor inválida."
        case .httpStatus(let code, let body):
            return body.isEmpty ? "Servidor respondió \(code)." : "Servidor respondió \(code): \(body)"
        }
    }
}

struct LeaderboardEntry: Decodable, Identifiable, Hashable {
    let doctor: String
    let total: Int
    let last30: Int

    var id: String { doctor }
}

private struct LeaderboardResponse: Decodable {
    let entries: [LeaderboardEntry]
}
