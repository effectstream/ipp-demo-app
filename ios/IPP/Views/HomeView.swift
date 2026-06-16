import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var session: SessionService

    @State private var showingNew = false
    @State private var showingSearch = false
    @State private var showingLeaderboard = false
    @State private var showingWeb = false
    @State private var newPatient = Patient.new()

    var body: some View {
        ZStack {
            Color.ippScreen.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Spacer()
                actions
                    .padding(.horizontal, 22)
                Spacer()
                walletFooter
                    .padding(.horizontal, 18)
                    .padding(.bottom, 18)
            }
        }
        .sheet(isPresented: $showingNew) {
            NavigationStack {
                PatientFormView(patient: newPatient, isNew: true)
            }
            .environmentObject(env)
            .environmentObject(env.schemaService)
            .environmentObject(session)
        }
        .sheet(isPresented: $showingSearch) {
            PatientListView()
                .environmentObject(env)
                .environmentObject(env.schemaService)
                .environmentObject(session)
        }
        .sheet(isPresented: $showingLeaderboard) {
            LeaderboardView()
                .environmentObject(env)
                .environmentObject(env.schemaService)
                .environmentObject(session)
        }
        .sheet(isPresented: $showingWeb) {
            WebDashboardView(url: env.webURL)
        }
    }

    private var header: some View {
        VStack(spacing: 11) {
            IPPMark(size: 56, shadow: true)
            VStack(spacing: 3) {
                Text("IPP")
                    .font(.system(size: 36, weight: .bold))
                    .kerning(-0.5)
                    .foregroundStyle(Color.ippInk)
                Text("Pacientes")
                    .font(.subheadline)
                    .foregroundStyle(Color.ippBody)
            }
        }
        .padding(.top, 52)
    }

    private var actions: some View {
        VStack(spacing: 12) {
            HomeOptionButton(
                title: "Nuevo Ingreso",
                subtitle: session.isViewer ? "Visitante: formulario sin guardar" : nil,
                systemImage: "plus.circle.fill",
                tint: .ippTeal
            ) {
                newPatient = Patient.new()
                showingNew = true
            }

            HomeOptionButton(
                title: "Buscar Paciente",
                subtitle: session.isViewer ? "Disponible con cuenta" : nil,
                systemImage: "magnifyingglass",
                tint: .ippTeal,
                disabled: session.isViewer
            ) {
                showingSearch = true
            }

            HomeOptionButton(
                title: "Ranking",
                subtitle: nil,
                systemImage: "trophy.fill",
                tint: .ippGold
            ) {
                showingLeaderboard = true
            }

            HomeOptionButton(
                title: "Tablero",
                subtitle: "Mapa de población y feedback",
                systemImage: "globe",
                tint: .ippTeal
            ) {
                showingWeb = true
            }
        }
    }

    private var walletFooter: some View {
        HStack(spacing: 12) {
            CardanoMark(size: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.username ?? "Visitante")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Color.ippInk)
                if let addr = session.walletAddress {
                    Text(CardanoWallet.shortAddress(addr))
                        .font(.caption.monospaced())
                        .foregroundStyle(Color.ippMuted)
                } else {
                    Text("Sin billetera asignada")
                        .font(.caption)
                        .foregroundStyle(Color.ippMuted)
                }
            }
            Spacer()
            Button("Salir") { session.logout() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.ippBorder, lineWidth: 1)
        )
    }
}

private struct HomeOptionButton: View {
    let title: String
    var subtitle: String?
    let systemImage: String
    let tint: Color
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(tint.opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: systemImage)
                        .font(.title3)
                        .foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(disabled ? Color.ippMuted : Color.ippInk)
                    if let subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(Color.ippMuted)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(Color.ippFaint)
            }
            .padding(15)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.ippBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.55 : 1)
    }
}
