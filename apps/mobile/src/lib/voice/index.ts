/**
 * Voice (STT + TTS) public API for `apps/mobile` (Phase 8).
 * See `docs/mobile/react-native-migration.md` §6.5.
 */
export {
  useSpeechRecognition,
  type UseSpeechRecognitionOptions,
  type UseSpeechRecognitionReturn,
} from "./useSpeechRecognition";

export {
  useTextToSpeech,
  type UseTextToSpeechOptions,
  type UseTextToSpeechReturn,
} from "./useTextToSpeech";
