// Synthetic Live 12 set covering every Live 12 -> 11 rule (no real Live sets are available here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { inspect, downgradeTo11, parse, serialize } from '../src/lib/als.js';

const live12 = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="12.0_12402" SchemaChangeCount="5" Creator="Ableton Live 12.4.6" Revision="abc" ExtraAttr="x">
\t<LiveSet>
\t\t<NextPointeeId Value="100" />
\t\t<Tracks>
\t\t\t<MidiTrack Id="1" SelectedToolPanel="7" SelectedGeneratorName="" SelectedTransformationName="">
\t\t\t\t<Name><EffectiveName Value="Synth" /></Name>
\t\t\t\t<TakeLanes>
\t\t\t\t\t<TakeLanes>
\t\t\t\t\t\t<TakeLane Id="3"><LomId Value="0" /><Name Value="Take 1" /></TakeLane>
\t\t\t\t\t</TakeLanes>
\t\t\t\t</TakeLanes>
\t\t\t\t<IsTuned Value="true" />
\t\t\t\t<ControllerLayoutCustomization><PitchClassSource Value="0" /></ControllerLayoutCustomization>
\t\t\t\t<ArrangementClipsListWrapper LomId="0" />
\t\t\t\t<PostProcessFreezeClips Value="0" />
\t\t\t\t<DeviceChain>
\t\t\t\t\t<Devices>
\t\t\t\t\t\t<Roar Id="5"><On Value="true" /></Roar>
\t\t\t\t\t\t<Saturator Id="6"><Oversampling Value="true" /></Saturator>
\t\t\t\t\t\t<PluginDevice Id="7"><PluginDesc><Vst3PluginInfo Id="0"><Name Value="Serum" /></Vst3PluginInfo></PluginDesc></PluginDevice>
\t\t\t\t\t</Devices>
\t\t\t\t\t<AudioOutputRouting><Target Value="AudioOut/Main" /></AudioOutputRouting>
\t\t\t\t\t<MainSequencer>
\t\t\t\t\t\t<ClipSlotList>
\t\t\t\t\t\t\t<ClipSlot Id="0"><HasStop Value="true" /></ClipSlot>
\t\t\t\t\t\t</ClipSlotList>
\t\t\t\t\t</MainSequencer>
\t\t\t\t</DeviceChain>
\t\t\t\t<MidiClip Id="9">
\t\t\t\t\t<IsInKey Value="true" />
\t\t\t\t\t<ScaleInformation><Root Value="0" /><Name Value="0" /></ScaleInformation>
\t\t\t\t\t<Notes>
\t\t\t\t\t\t<KeyTracks><KeyTrack><Notes><MidiNoteEvent Time="0" Duration="1" Velocity="100" NoteId="1" /></Notes></KeyTrack></KeyTracks>
\t\t\t\t\t\t<NoteProbabilityGroups />
\t\t\t\t\t</Notes>
\t\t\t\t\t<AccidentalSpellingPreference Value="0" />
\t\t\t\t\t<ExpressionGrid />
\t\t\t\t</MidiClip>
\t\t\t</MidiTrack>
\t\t</Tracks>
\t\t<MainTrack>
\t\t\t<DeviceChain><Mixer><Tempo><Manual Value="128" /></Tempo><Sends /></Mixer></DeviceChain>
\t\t</MainTrack>
\t\t<SessionScrollPos X="0" Y="2" />
\t\t<TuningSystems />
\t\t<NoteSpellingPreference Value="0" />
\t\t<Annotation Value="" />
\t\t<ContentLanes><MidiEditorLaneModel Type="4" /></ContentLanes>
\t\t<IsSongTempoLeader Value="false" />
\t</LiveSet>
</Ableton>
`;

const gz = (s) => gzipSync(strToU8(s));

test('parse/serialize round trip is byte-identical', () => {
  assert.equal(serialize(parse(live12)), live12);
});

test('inspect a Live 12 set', () => {
  const r = inspect(gz(live12));
  assert.equal(r.major, 12);
  assert.equal(r.tempo, 128);
  assert.equal(r.tracks.midi, 1);
  assert.deepEqual(r.plugins, ['Serum']);
  assert.deepEqual(r.live12Only, [{ label: 'Roar', count: 1 }]);
  assert.equal(r.midiTakes, 1);
  assert.equal(r.canDowngrade, true);
});

test('Live 12 -> 11 applies every rule', () => {
  const out = strFromU8(gunzipSync(downgradeTo11(gz(live12)).bytes));
  // version strings, extra root attributes dropped
  assert.match(out, /MinorVersion="11.0_11300"/);
  assert.match(out, /Creator="Ableton Live 11.3.21"/);
  assert.doesNotMatch(out, /ExtraAttr/);
  // removed elements and attributes
  for (const n of ['<Roar', '<IsTuned', '<ControllerLayoutCustomization', '<ArrangementClipsListWrapper', '<TuningSystems', '<NoteProbabilityGroups', 'SelectedToolPanel', '<AccidentalSpellingPreference']) {
    assert.ok(!out.includes(n), `still contains ${n}`);
  }
  assert.ok(!/<LiveSet>[\s\S]*\n\t\t<NoteSpellingPreference/.test(out), 'LiveSet/NoteSpellingPreference removed');
  // renames
  assert.ok(out.includes('<MasterTrack>') && !out.includes('<MainTrack'));
  assert.ok(out.includes('<IsSongTempoMaster'));
  assert.ok(out.includes('<ExpressionLane Type="4"'));
  assert.ok(out.includes('<RootNote Value="0"'));
  // emptied
  assert.ok(out.includes('<Sends />') || out.includes('<Sends></Sends>'));
  assert.ok(!out.includes('Take 1'), 'MIDI take lanes dropped');
  // default attributes on notes
  assert.match(out, /<MidiNoteEvent [^>]*VelocityDeviation="0"[^>]*Probability="1"[^>]*IsEnabled="true"/);
  // specials
  assert.ok(out.includes('<Oversampling Value="1"'));
  assert.ok(out.includes('Value="AudioOut/Master"'));
  assert.ok(/<SongMasterValues>\s*<SessionScrollerPos X="0" Y="2" \/>\s*<\/SongMasterValues>/.test(out));
  assert.ok(!out.includes('<SessionScrollPos'));
  assert.ok(/<VelocityDetail Value="0" \/>\s*<NeedArrangerRefreeze Value="true" \/>\s*<PostProcessFreezeClips/.test(out));
  assert.ok(/<HasStop Value="true" \/>\s*<NeedRefreeze Value="true" \/>/.test(out));
  assert.ok(/<ChooserBar Value="0" \/>\s*<Annotation/.test(out));
  // clip scale moved in front of ExpressionGrid, scale name written as text
  assert.ok(/<Notes>[\s\S]*<\/Notes>[\s\S]*<IsInKey[\s\S]*<ScaleInformation>[\s\S]*<ExpressionGrid/.test(out) ||
            /<\/Notes>[\s\S]*<ScaleInformation>[\s\S]*<IsInKey[\s\S]*<ExpressionGrid/.test(out));
  assert.ok(out.includes('<Name Value="Major"'));
  // result is well formed
  assert.equal(serialize(parse(out)), out);
});

test('refuses non-Live-12 and non-Ableton files', () => {
  const live11 = live12.replace('12.0_12402', '11.0_11300');
  assert.throws(() => downgradeTo11(gz(live11)), (e) => e.code === 'not-12');
  assert.throws(() => inspect(strToU8('<hello/>')), (e) => e.code === 'not-als');
  assert.throws(() => inspect(gz(live12).slice(0, 50)), (e) => e.code === 'gzip');
});
