// Ds Man — a walkman-style MP3 player. The top screen browses the library;
// the bottom screen is the now-playing deck.
import { AuxiliarySurface, Text, View } from "@pocketjs/framework/components";

export default function App() {
  return (
    <>
      <View class="w-full h-full flex-col items-center justify-center gap-2 bg-slate-950">
        <Text class="text-xl text-white font-bold">Ds Man</Text>
      </View>
      <AuxiliarySurface>
        <View class="w-full h-full flex-col items-center justify-center bg-slate-900">
          <Text class="text-sm text-slate-400">Nothing playing — pick a song above</Text>
        </View>
      </AuxiliarySurface>
    </>
  );
}
