import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateTicket, useSupportTickets } from '../hooks';
import { notify } from '../../../shared/ui/feedback';

export default function Support() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [show, setShow] = useState(!!orderId);
  const ticketsQuery = useSupportTickets();
  const createMutation = useCreateTicket();

  const topPadding = Math.max(insets.top, 24) + 12;
  const bottomPadding = Math.max(insets.bottom, 16) + 32;

  const create = async () => {
    try {
      await createMutation.mutateAsync({ subject, description, orderId });
      notify(`Support request sent: We’ll reply as soon as possible.`, 'info');
      setSubject('');
      setDescription('');
      setShow(false);
    } catch (e) {
      notify(`Could not send request: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.back}>‹  Back</Text>
      </Pressable>
      <Text style={s.heading}>Help & support</Text>
      <Text style={s.sub}>Your support requests and replies.</Text>
      <Pressable style={s.button} onPress={() => setShow(!show)}>
        <Text style={s.buttonText}>{show ? 'Close form' : 'Create a support request'}</Text>
      </Pressable>
      {show && (
        <View style={s.form}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="What do you need help with?"
            style={s.input}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue (at least 10 characters)"
            multiline
            style={[s.input, s.multiline]}
          />
          <Pressable style={s.send} onPress={create} disabled={createMutation.isPending}>
            <Text style={s.buttonText}>{createMutation.isPending ? 'Sending…' : 'Send request'}</Text>
          </Pressable>
        </View>
      )}
      {(ticketsQuery.data?.tickets || []).map((t, i) => (
        <View key={t._id || i} style={s.ticket}>
          <Text style={s.title}>
            {t.ticketNumber} · {t.subject}
          </Text>
          <Text style={s.sub}>
            {t.status} · Updated {new Date(t.updatedAt || Date.now()).toLocaleDateString()}
          </Text>
          {(t.messages || []).slice(-2).map((m: any, j: number) => (
            <Text key={j} style={s.message}>
              {m.sender}: {m.message}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5' },
  content: { paddingHorizontal: 22 },
  backBtn: { paddingVertical: 6, alignSelf: 'flex-start' },
  back: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: '#19281f', marginTop: 14 },
  sub: { fontSize: 13, color: '#77837b', marginTop: 4 },
  button: { height: 49, backgroundColor: '#16A34A', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontWeight: '800' },
  form: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginTop: 10 },
  input: { height: 50, backgroundColor: '#f5f7f5', borderRadius: 11, paddingHorizontal: 14, marginTop: 9 },
  multiline: { height: 110, textAlignVertical: 'top', paddingVertical: 12 },
  send: { height: 47, backgroundColor: '#16A34A', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  ticket: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginTop: 10 },
  title: { fontWeight: '800', color: '#27372e' },
  message: { color: '#55635a', marginTop: 8, lineHeight: 19 },
});
