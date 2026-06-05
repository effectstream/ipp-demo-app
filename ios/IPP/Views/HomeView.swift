import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var session: SessionService

    @State private var showingNew = false
    @State private var showingSearch = false
    @State private var showingLeaderboard = false
    @State private var newPatient = Patient.new()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemBackground), Color.indigo.opacity(0.04)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

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
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text("IPP")
                .font(.system(size: 40, weight: .bold))
                .kerning(-0.5)
            Text("Pacientes")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 56)
    }

    private var actions: some View {
        VStack(spacing: 14) {
            HomeOptionButton(
                title: "Nuevo Ingreso",
                subtitle: session.isViewer ? "Visitante: formulario sin guardar" : nil,
                systemImage: "plus.circle.fill",
                tint: .blue
            ) {
                newPatient = Patient.new()
                showingNew = true
            }

            HomeOptionButton(
                title: "Buscar Paciente",
                subtitle: session.isViewer ? "Disponible con cuenta" : nil,
                systemImage: "magnifyingglass",
                tint: .purple,
                disabled: session.isViewer
            ) {
                showingSearch = true
            }

            HomeOptionButton(
                title: "Ranking",
                subtitle: nil,
                systemImage: "trophy.fill",
                tint: .orange
            ) {
                showingLeaderboard = true
            }
        }
    }

    private var walletFooter: some View {
        HStack(spacing: 12) {
            CardanoMark(size: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.username ?? "Visitante")
                    .font(.callout.weight(.semibold))
                if let addr = session.walletAddress {
                    Text(CardanoWallet.shortAddress(addr))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                } else {
                    Text("Sin billetera asignada")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Salir") { session.logout() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
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
                        .fill(tint.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: systemImage)
                        .font(.title2)
                        .foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(disabled ? .secondary : .primary)
                    if let subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(.tertiary)
            }
            .padding(16)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.black.opacity(0.04), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.55 : 1)
    }
}
