import Foundation

protocol PatientStore {
    func list() async throws -> [Patient]
    func get(id: String) async throws -> Patient?
    /// Saves the patient and returns the server-confirmed copy (with a
    /// passcode and any server-assigned fields populated).
    func save(_ patient: Patient) async throws -> Patient
    func delete(id: String) async throws
}

// Fallback store backed by a JSON file in the app's Documents directory.
// Used only when no backend URL is reachable; the primary store is
// APIPatientStore against the IPP backend.
final class LocalPatientStore: PatientStore {
    private let fileURL: URL
    private var cache: [String: Patient] = [:]

    init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        fileURL = docs.appendingPathComponent("patients.json")
        loadFromDisk()
    }

    private func loadFromDisk() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let arr = try? decoder.decode([Patient].self, from: data) {
            cache = Dictionary(uniqueKeysWithValues: arr.map { ($0.id, $0) })
        }
    }

    private func persist() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }

    func list() async throws -> [Patient] {
        Array(cache.values).sorted { $0.updatedAt > $1.updatedAt }
    }

    func get(id: String) async throws -> Patient? { cache[id] }

    func save(_ patient: Patient) async throws -> Patient {
        var p = patient
        p.updatedAt = Date()
        cache[p.id] = p
        try persist()
        return p
    }

    func delete(id: String) async throws {
        cache.removeValue(forKey: id)
        try persist()
    }
}
