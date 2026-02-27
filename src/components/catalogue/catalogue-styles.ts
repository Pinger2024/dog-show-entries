import { StyleSheet, Font } from '@react-pdf/renderer';

// Register standard fonts for catalogue
Font.register({
  family: 'Times',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/@canvas-fonts/times-new-roman@1.0.4/Times New Roman.ttf' },
    { src: 'https://cdn.jsdelivr.net/npm/@canvas-fonts/times-new-roman-bold@1.0.4/Times New Roman Bold.ttf', fontWeight: 'bold' },
    { src: 'https://cdn.jsdelivr.net/npm/@canvas-fonts/times-new-roman-italic@1.0.4/Times New Roman Italic.ttf', fontStyle: 'italic' },
  ],
});

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Times',
    fontSize: 9,
    padding: 40,
    paddingBottom: 60,
    lineHeight: 1.4,
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    marginBottom: 2,
  },
  headerDetail: {
    fontSize: 8,
    color: '#555',
    marginTop: 2,
  },
  groupHeading: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '6 10',
    marginTop: 16,
    marginBottom: 8,
  },
  breedHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 3,
    marginTop: 12,
    marginBottom: 6,
  },
  sexHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    fontStyle: 'italic',
    marginTop: 6,
    marginBottom: 4,
    paddingLeft: 4,
  },
  entryRow: {
    marginBottom: 8,
    paddingLeft: 8,
  },
  catalogueNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  dogName: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  entryDetail: {
    fontSize: 8,
    color: '#333',
    marginBottom: 0.5,
  },
  entryClasses: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 2,
  },
  classHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  absenteeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 6,
  },
  pageNumber: {
    fontSize: 8,
    color: '#666',
  },
  // Ring plan styles
  ringCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 8,
  },
  ringTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  ringJudge: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  ringClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
});
