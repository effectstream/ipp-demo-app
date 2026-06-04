import Foundation
import SwiftUI

@MainActor
final class AppEnvironment: ObservableObject {
    let apiStore: APIPatientStore
    let effectStream: EffectStreamClient
    let session: SessionService
    let schemaService: SchemaService

    var store: PatientStore { apiStore }
    var schema: FormSchema { schemaService.schema }

    @Published var lastAnchor: AnchorResponse?
    @Published var lastError: String?

    init(
        apiStore: APIPatientStore,
        effectStream: EffectStreamClient,
        session: SessionService,
        schemaService: SchemaService
    ) {
        self.apiStore = apiStore
        self.effectStream = effectStream
        self.session = session
        self.schemaService = schemaService
        // Doctor name on every save comes from the session — the username
        // becomes the leaderboard attribution.
        apiStore.doctorNameProvider = { [weak session] in
            MainActor.assumeIsolated { session?.username }
        }
    }

    static func live() -> AppEnvironment {
        let backendURLString = Bundle.main.object(forInfoDictionaryKey: "BackendURL") as? String
            ?? "http://localhost:3334"
        let url = URL(string: backendURLString) ?? URL(string: "http://localhost:3334")!
        return AppEnvironment(
            apiStore: APIPatientStore(baseURL: url),
            effectStream: EffectStreamClient(baseURL: url),
            session: SessionService(),
            schemaService: SchemaService(baseURL: url)
        )
    }

    func saveAndAnchor(_ patient: Patient) async -> Patient? {
        do {
            let saved = try await store.save(patient)
            let hash = try PatientHasher.sha256Hex(saved)
            let response = try await effectStream.anchorPatientHash(
                patientId: saved.id,
                hashHex: hash
            )
            lastAnchor = response
            lastError = nil
            return saved
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    func fetchLeaderboard() async throws -> [LeaderboardEntry] {
        try await apiStore.fetchLeaderboard()
    }
}
