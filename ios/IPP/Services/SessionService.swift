import Foundation
import SwiftUI

// Tracks the current session. Three states:
//   .none        — not authenticated, must hit the login screen
//   .viewer      — anonymous "visitante" mode (read-only, can't submit)
//   .loggedIn    — full doctor session, can submit and search
//
// Persisted to UserDefaults so the user doesn't have to log in every time.
@MainActor
final class SessionService: ObservableObject {
    enum State: Equatable {
        case none
        case viewer
        case loggedIn(Account)
    }

    @Published private(set) var state: State

    private static let key = "ipp.session.state.v1"
    private static let viewerToken = "__viewer__"

    init() {
        self.state = Self.load()
    }

    var isAuthenticated: Bool {
        if case .none = state { return false } else { return true }
    }

    var isViewer: Bool {
        if case .viewer = state { return true } else { return false }
    }

    var canSubmit: Bool {
        if case .loggedIn = state { return true } else { return false }
    }

    var username: String? {
        if case .loggedIn(let a) = state { return a.username } else { return nil }
    }

    var walletAddress: String? {
        if case .loggedIn(let a) = state { return a.walletAddress } else { return nil }
    }

    // ed25519 signing identity for the logged-in doctor (nil for viewer/none),
    // derived from the account seed. Used to sign doctor-scope API requests.
    var wallet: Wallet? {
        if case .loggedIn(let a) = state { return Wallet(seedHex: a.secretKey) } else { return nil }
    }

    func loginWithCredentials(username: String, password: String) -> Bool {
        guard let account = DemoAccounts.find(username: username, password: password) else {
            return false
        }
        state = .loggedIn(account)
        UserDefaults.standard.set(account.username, forKey: Self.key)
        return true
    }

    func enterAsViewer() {
        state = .viewer
        UserDefaults.standard.set(Self.viewerToken, forKey: Self.key)
    }

    func logout() {
        state = .none
        UserDefaults.standard.removeObject(forKey: Self.key)
    }

    private static func load() -> State {
        guard let raw = UserDefaults.standard.string(forKey: key) else { return .none }
        if raw == viewerToken { return .viewer }
        if let account = DemoAccounts.all.first(where: { $0.username == raw }) {
            return .loggedIn(account)
        }
        return .none
    }
}
