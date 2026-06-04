import SwiftUI
import MapKit
import CoreLocation

struct AddressPicker: View {
    @Binding var direccion: String
    @Binding var latitud: Double?
    @Binding var longitud: Double?

    @StateObject private var search = AddressSearchModel()
    @FocusState private var fieldFocused: Bool
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var resolving: Bool = false
    @State private var statusMessage: String?
    @State private var didTryInitialGeocode = false

    private var pinCoordinate: CLLocationCoordinate2D? {
        guard let lat = latitud, let lng = longitud else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private var showSuggestions: Bool {
        fieldFocused && !search.suggestions.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Buscar o escribir dirección", text: $direccion, axis: .vertical)
                    .lineLimit(1...3)
                    .focused($fieldFocused)
                    .textContentType(.fullStreetAddress)
                    .autocorrectionDisabled(true)
                    .onChange(of: direccion) { _, new in
                        search.updateQuery(new)
                        if new.trimmingCharacters(in: .whitespaces).isEmpty {
                            latitud = nil
                            longitud = nil
                            statusMessage = nil
                        }
                    }
                    .onSubmit { Task { await geocodeFreeText() } }
                if resolving {
                    ProgressView().controlSize(.small)
                }
            }
            .padding(10)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            if showSuggestions {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(search.suggestions.prefix(5), id: \.self) { s in
                        Button { Task { await pick(s) } } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.title).font(.callout).foregroundStyle(.primary)
                                if !s.subtitle.isEmpty {
                                    Text(s.subtitle).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if let coord = pinCoordinate {
                Map(position: $cameraPosition) {
                    Marker(direccion.isEmpty ? "Dirección" : direccion, coordinate: coord)
                        .tint(.red)
                }
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .allowsHitTesting(true)
                .onTapGesture {
                    fieldFocused = false
                }

                HStack {
                    Text(String(format: "%.5f, %.5f", coord.latitude, coord.longitude))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        latitud = nil
                        longitud = nil
                    } label: {
                        Label("Quitar pin", systemImage: "mappin.slash")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            } else if let msg = statusMessage {
                Text(msg).font(.caption).foregroundStyle(.secondary)
            }
        }
        .onAppear {
            // If we have a saved text address but no coords (e.g. a record
            // created before this picker existed), try to geocode once so
            // the map appears automatically.
            if !didTryInitialGeocode && pinCoordinate == nil && !direccion.trimmingCharacters(in: .whitespaces).isEmpty {
                didTryInitialGeocode = true
                Task { await geocodeFreeText(silentOnFail: true) }
            }
        }
        .onChange(of: pinCoordinate?.latitude) { _, _ in centerCameraOnPin() }
        .onChange(of: pinCoordinate?.longitude) { _, _ in centerCameraOnPin() }
    }

    private func pick(_ suggestion: MKLocalSearchCompletion) async {
        fieldFocused = false
        resolving = true
        defer { resolving = false }
        do {
            let resolved = try await search.resolve(suggestion)
            direccion = resolved.display
            latitud = resolved.coordinate.latitude
            longitud = resolved.coordinate.longitude
            statusMessage = nil
            search.clearSuggestions()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func geocodeFreeText(silentOnFail: Bool = false) async {
        let text = direccion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        resolving = true
        defer { resolving = false }
        do {
            let resolved = try await AddressSearchModel.geocode(text)
            latitud = resolved.coordinate.latitude
            longitud = resolved.coordinate.longitude
            statusMessage = nil
        } catch {
            if !silentOnFail {
                statusMessage = error.localizedDescription
            }
        }
    }

    private func centerCameraOnPin() {
        guard let coord = pinCoordinate else { return }
        cameraPosition = .region(MKCoordinateRegion(
            center: coord,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        ))
    }
}
