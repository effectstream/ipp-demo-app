import SwiftUI

@main
struct IPPApp: App {
    @StateObject private var env = AppEnvironment.live()

    var body: some Scene {
        WindowGroup {
            SessionGate()
                .environmentObject(env)
                .environmentObject(env.schemaService)
                .environmentObject(env.session)
                .tint(.ippTeal)
                .preferredColorScheme(.light)
                .task {
                    await env.schemaService.refresh()
                }
        }
    }
}

// Re-renders whenever the SessionService publishes - so logging in, entering
// as viewer, and tapping Salir all flip between LoginView and HomeView
// without any extra plumbing.
private struct SessionGate: View {
    @EnvironmentObject private var session: SessionService

    var body: some View {
        if session.isAuthenticated {
            HomeView()
        } else {
            LoginView()
        }
    }
}
