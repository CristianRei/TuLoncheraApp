import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Tu Lonchera</Text>
      <Text style={styles.subtitulo}>Base de datos local inicializada.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitulo: {
    fontSize: 14,
    color: '#666',
  },
});
