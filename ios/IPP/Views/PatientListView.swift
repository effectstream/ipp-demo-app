import SwiftUI

// Sheet presented from HomeView for "Buscar Paciente". The patient list with
// search, plus push-navigation into individual records.
struct PatientListView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var patients: [Patient] = []
    @State private var searchText: String = ""

    private var filtered: [Patient] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return patients }
        return patients.filter {
            $0.nombre.lowercased().contains(q)
                || $0.rut.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                if patients.isEmpty {
                    EmptyState()
                } else {
                    List {
                        ForEach(filtered) { patient in
                            NavigationLink(value: patient) {
                                PatientRow(patient: patient)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Buscar Paciente")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Buscar por nombre o RUT")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Listo") { dismiss() }
                }
            }
            .navigationDestination(for: Patient.self) { patient in
                PatientFormView(patient: patient)
            }
            .task { await refresh() }
            .refreshable { await refresh() }
        }
    }

    private func refresh() async {
        if let list = try? await env.store.list() {
            patients = list
        }
    }
}

private struct PatientRow: View {
    let patient: Patient

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(patient.nombre.isEmpty ? "Sin nombre" : patient.nombre)
                .font(.headline)
            HStack(spacing: 12) {
                if !patient.rut.isEmpty {
                    Text(patient.rut).font(.caption).foregroundStyle(.secondary)
                }
                if let edad = patient.edad {
                    Text("\(edad) años").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct EmptyState: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Sin pacientes registrados")
                .font(.headline)
            Text("Vuelve y elige “Nuevo Ingreso” para registrar al primer paciente.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
}
