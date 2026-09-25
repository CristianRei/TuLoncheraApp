import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatearPesos } from '@/core/dinero';
import type { Producto } from '@/core/tipos';
import { COLORES_ADMIN } from '@/ui/tema';

interface Props {
  productos: Producto[];
  cantidades: Record<string, number>;
  onCambiarCantidad: (productoId: string, delta: number) => void;
  busqueda: string;
  onCambiarBusqueda: (texto: string) => void;
  colorAcento: string;
  /** Si se pasa, tope el contador a este disponible por producto (ej. stock de bodega). */
  disponibles?: Record<string, number>;
}

export function SelectorProductosConCantidad({
  productos,
  cantidades,
  onCambiarCantidad,
  busqueda,
  onCambiarBusqueda,
  colorAcento,
  disponibles,
}: Props) {
  const filtrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <View style={styles.contenedor}>
      <View style={styles.controles}>
        <TextInput
          style={styles.busqueda}
          placeholder="Buscar producto..."
          placeholderTextColor="#999"
          value={busqueda}
          onChangeText={onCambiarBusqueda}
        />
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => {
          const cantidad = cantidades[item.id] ?? 0;
          const disponible = disponibles?.[item.id];
          const alTope = disponible !== undefined && cantidad >= disponible;
          return (
            <View style={styles.fila}>
              <View style={styles.filaTexto}>
                <Text style={styles.filaNombre} numberOfLines={2}>
                  {item.nombre}
                </Text>
                <Text style={[styles.filaPrecio, { color: colorAcento }]}>
                  {formatearPesos(item.precio)}
                </Text>
                {disponible !== undefined && (
                  <Text style={styles.filaDisponible}>Disponible: {disponible}</Text>
                )}
              </View>
              <View style={styles.contador}>
                <Pressable
                  style={styles.contadorBoton}
                  onPress={() => onCambiarCantidad(item.id, -1)}
                >
                  <Text style={styles.contadorBotonTexto}>−</Text>
                </Pressable>
                <Text style={styles.contadorValor}>{cantidad}</Text>
                <Pressable
                  style={[styles.contadorBoton, alTope && styles.contadorBotonDeshabilitado]}
                  disabled={alTope}
                  onPress={() => onCambiarCantidad(item.id, 1)}
                >
                  <Text
                    style={[
                      styles.contadorBotonTexto,
                      alTope && styles.contadorBotonTextoDeshabilitado,
                    ]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
  },
  controles: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  busqueda: {
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORES_ADMIN.bordeSuave,
  },
  lista: {
    padding: 20,
    gap: 10,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORES_ADMIN.superficieMasBaja,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES_ADMIN.texto,
  },
  filaPrecio: {
    fontSize: 13,
    fontWeight: '600',
  },
  filaDisponible: {
    fontSize: 12,
    color: COLORES_ADMIN.textoSecundario,
  },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contadorBoton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORES_ADMIN.superficieBaja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorBotonDeshabilitado: {
    opacity: 0.4,
  },
  contadorBotonTexto: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES_ADMIN.textoSecundario,
  },
  contadorBotonTextoDeshabilitado: {
    color: COLORES_ADMIN.textoSecundario,
  },
  contadorValor: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
});
