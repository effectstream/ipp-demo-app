import SwiftUI

struct LeaderboardView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var session: SessionService
    @Environment(\.dismiss) private var dismiss

    @State private var entries: [LeaderboardEntry] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let username = session.username {
                    Section("Mi cuenta") {
                        HStack {
                            Image(systemName: "person.crop.circle.fill")
                                .foregroundStyle(Color.accentColor)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(username).font(.callout.weight(.semibold))
                                if let addr = session.walletAddress {
                                    Text(CardanoWallet.shortAddress(addr))
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } else if session.isViewer {
                    Section("Mi cuenta") {
                        Text("Visitante — sin atribución en el ranking.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Ranking") {
                    if loading {
                        HStack { ProgressView(); Text("Cargando…") }
                    } else if let error {
                        Text(error).foregroundStyle(.red)
                    } else if entries.isEmpty {
                        Text("Sin datos todavía.").foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                            LeaderboardRow(
                                rank: idx + 1,
                                entry: entry,
                                isMe: entry.doctor == session.username
                            )
                        }
                    }
                }
            }
            .navigationTitle("Ranking de ingresos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Listo") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await load() } } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            entries = try await env.fetchLeaderboard()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

private struct LeaderboardRow: View {
    let rank: Int
    let entry: LeaderboardEntry
    let isMe: Bool

    private var medalColor: Color? {
        switch rank {
        case 1: return Color(red: 0.95, green: 0.78, blue: 0.18)   // gold
        case 2: return Color(red: 0.75, green: 0.78, blue: 0.82)   // silver
        case 3: return Color(red: 0.80, green: 0.50, blue: 0.20)   // bronze
        default: return nil
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(isMe ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill))
                    .frame(width: 36, height: 36)
                if let medalColor {
                    Image(systemName: "trophy.fill")
                        .foregroundStyle(medalColor)
                        .font(.title3)
                } else {
                    Text("\(rank)").font(.callout.bold()).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.doctor)
                    .font(.callout.weight(isMe ? .semibold : .regular))
                Text("\(entry.last30) en los últimos 30 días")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(entry.total)").font(.title3.monospacedDigit().bold())
                Text("ingresos").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
