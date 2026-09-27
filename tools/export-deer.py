import bpy
bpy.ops.wm.open_mainfile(filepath='/home/user/.cache/assets/doe.blend')
for o in list(bpy.data.objects):
 if o.name not in ['Armature','Body','Eyes','Head']: bpy.data.objects.remove(o,do_unlink=True)
for o in bpy.data.objects:
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
  print('MESH',o.name,[m.name for m in o.data.materials])
for m in bpy.data.materials:
 m.use_nodes=True; bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.86
 image=bpy.data.images.get('doe-head' if m.name=='head' else 'doe-body' if m.name=='body' else '')
 if image:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.links.new(t.outputs['Color'],bs.inputs['Base Color'])
 else:bs.inputs['Base Color'].default_value=(.026,.018,.009,1)
arm=bpy.data.objects['Armature'];arm.animation_data.action=None
for t in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(t)
for a in list(bpy.data.actions):
 if a.name not in ['Eat.001','Idle.000','LookAround.000','Run']:bpy.data.actions.remove(a)
for a in bpy.data.actions:
 a.name={'Eat.001':'Graze','Idle.000':'Idle','LookAround.000':'Alert'}.get(a.name,a.name)
 a.use_fake_user=True
arm.animation_data.action=bpy.data.actions.get('Idle')
bpy.context.scene.frame_set(0)
bpy.ops.export_scene.gltf(filepath='/home/user/public/models/doe.glb',export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False)
