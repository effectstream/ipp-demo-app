import Foundation
import SwiftUI

@MainActor
final class AppEnvironment: ObservableObject {
    let apiStore: APIPatientStore
    let effectStream: EffectStreamClient
    let session: SessionService
    let schemaService: SchemaService
    /// URL of the web dashboard (map + búsqueda + feedback) embedded in-app.
    let webURL: URL

    var store: PatientStore { apiStore }
    var schema: FormSchema { schemaService.schema }

    @Published var lastAnchor: AnchorResponse?
    @Published var lastError: String?

    init(
        apiStore: APIPatientStore,
        effectStream: EffectStreamClient,
        session: SessionService,
        schemaService: SchemaService,
        webURL: URL
    ) {
        self.apiStore = apiStore
        self.effectStream = effectStream
        self.session = session
        self.schemaService = schemaService
        self.webURL = webURL
        // Doctor name on every save comes from the session - the username
        // becomes the leaderboard attribution.
        apiStore.doctorNameProvider = { [weak session] in
            MainActor.assumeIsolated { session?.username }
        }
        // Sign doctor-scope requests with the logged-in account's ed25519 key.
        apiStore.signerProvider = { [weak session] in
            MainActor.assumeIsolated {
                guard let session, let wallet = session.wallet, let username = session.username else {
                    return nil
                }
                return DoctorSigner(wallet: wallet, username: username)
            }
        }
    }

    static func live() -> AppEnvironment {
        let backendURLString = Bundle.main.object(forInfoDictionaryKey: "BackendURL") as? String
            ?? "http://localhost:3334"
        let url = URL(string: backendURLString) ?? URL(string: "http://localhost:3334")!
        let webURLString = Bundle.main.object(forInfoDictionaryKey: "WebURL") as? String
            ?? "http://localhost:5174"
        let webURL = URL(string: webURLString) ?? URL(string: "http://localhost:5174")!
        return AppEnvironment(
            apiStore: APIPatientStore(baseURL: url),
            effectStream: EffectStreamClient(baseURL: url),
            session: SessionService(),
            schemaService: SchemaService(baseURL: url),
            webURL: webURL
        )
    }

    func saveAndAnchor(_ patient: Patient) async -> Patient? {
        do {
            guard let wallet = session.wallet else {
                lastError = "Inicia sesión para guardar y anclar."
                return nil
            }
            let saved = try await store.save(patient)
            let hash = try PatientHasher.sha256Hex(saved)
            let response = try await effectStream.anchorPatientHash(
                patientId: saved.id,
                hashHex: hash,
                wallet: wallet
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

    /// Records a search for ranking points (+10). Best-effort, viewer-safe.
    func recordSearch() async {
        await apiStore.logSearchEvent()
    }

    /// Per-field comparison stats for the patient form (nil for viewers/errors).
    func fetchFieldStats(lat: Double?, lng: Double?) async -> FieldStatsBundle? {
        await apiStore.fetchFieldStats(lat: lat, lng: lng)
    }
}
