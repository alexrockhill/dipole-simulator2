"""Saves the data and combines the javascript with sphinx."""
# Authors: Alex Rockhill <aprockhill@mailbox.org>
#
# License: BSD-3-Clause
import os.path as op
import numpy as np
from tqdm import tqdm
import pandas as pd
import mne
import nibabel as nib
import matplotlib.pyplot as plt

data_path = mne.datasets.sample.data_path()
subjects_dir = op.join(data_path, 'subjects')
trans = mne.read_trans(op.join(data_path, 'MEG', 'sample',
                               'sample_audvis_raw-trans.fif'))
evoked = mne.read_evokeds(op.join(data_path, 'MEG', 'sample',
                                  'sample_audvis-ave.fif'))[0]
evoked.info['bads'] = list()  # remove bad channels
bem_fname = op.join(subjects_dir, 'sample', 'bem',
                    'sample-5120-5120-5120-bem.fif')
bem_sol = op.join(subjects_dir, 'sample', 'bem',
                  'sample-5120-5120-5120-bem-sol.fif')

src = mne.setup_volume_source_space(
    subject='sample', pos=20,  # in mm
    bem=bem_fname, subjects_dir=subjects_dir)

# make the leadfield matrix
fwd = mne.make_forward_solution(
    evoked.info, trans=trans, src=src, bem=bem_sol)

ico = mne.surface._get_ico_surface(grade=2)['rr']
angles = np.rad2deg(mne.transforms._cart_to_sph(ico)[:, 1:])
# for the approximate angular step
# np.rad2deg(np.min(np.linalg.norm(angles[0] - angles[1:], axis=1)))
pd.DataFrame(dict(zip(('theta', 'phi'), angles.T))).to_csv(
    op.join('doc', '_data', 'angles.csv'), index=False)

# save colormap
cmap = plt.get_cmap('RdBu_r')
cmap_data = np.array([cmap(val) for val in np.linspace(0, 1, 101)])
pd.DataFrame(dict(zip(('r', 'g', 'b', 'a'), cmap_data.T))).to_csv(
    op.join('doc', '_data', 'cmap.csv'), index=False)

n_dipoles = fwd['source_rr'].shape[0]
# Would be used for inefficient equivalent computation below:
#   vertices = [fwd['src'][0]['vertno']]
#   data = np.zeros((n_dipoles, 3, 1))
#   stc = mne.VolVectorSourceEstimate(data, vertices=vertices,
#                                     subject='sample', tmin=0, tstep=1)

dipole_data = dict()
for vert_idx in tqdm(range(n_dipoles)):
    for angle_idx, ori in enumerate(ico):
        # the leadfield matrix (fwd['sol']['data']) has three vectors for the
        # three spatial directions which are stored in order
        evoked_data = (fwd['sol']['data'][:, vert_idx * 3:(vert_idx + 1) * 3]
                       @ ori.reshape((3, 1))) * 3e-8
        # equivalent to: (but doesn't do the sparse matrix multiplication)
        #   data = np.zeros((n_dipoles, 3, 1))
        #   data[vert_idx] = 3e-8 * ori.reshape((3, 1))
        #   stc.data = data
        #   evoked = mne.simulation.simulate_evoked(
        #        fwd, stc, evoked.info, cov=None, nave=np.inf, verbose=False)
        dipole_data[(vert_idx, angle_idx)] = evoked_data.flatten()


# params for scaling evoked
evoked_data_all = np.array(list(dipole_data.values()))
evoked_data_min = evoked_data_all.min()
evoked_data_range = evoked_data_all.max() - evoked_data_min

# save each separate so not all have to be loaded at once
for (vert_idx, angle_idx), evoked_data in tqdm(dipole_data.items()):
    # make each one an index of the colormap instead of raw data
    pd.DataFrame((((evoked_data - evoked_data_min) / evoked_data_range
                   ).round(2) * 100).astype(int)).to_csv(
        op.join('doc', '_data', 'dipole_data',
                f'vi-{vert_idx}_ai-{angle_idx}.csv'),
        header=False, index=False)


# surfaces and points

''' Could transform to RAS, just move camera instead
T1 = nib.load(op.join(subjects_dir, 'sample', 'mri', 'T1.mgz'))
ornt = nib.orientations.axcodes2ornt(
    nib.orientations.aff2axcodes(T1.affine)).astype(int)
ras_ornt = nib.orientations.axcodes2ornt('RAS')
ornt_trans = nib.orientations.ornt_transform(ornt, ras_ornt)
'''

head = mne._freesurfer._get_head_surface(
    'head', 'sample', subjects_dir)  # could be seghead for better res
pd.DataFrame(dict(zip(('L', 'I', 'A'), head['rr'].T))).to_csv(
    op.join('doc', '_data', 'head_verts.csv'), index=False)
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), head['tris'].T))).to_csv(
    op.join('doc', '_data', 'head_tris.csv'), index=False)

fwd_rr = fwd['source_rr']
fwd_rr = mne.transforms.apply_trans(trans, fwd_rr) * 1000
pd.DataFrame(dict(zip(('L', 'I', 'A'), fwd_rr.T))).to_csv(
    op.join('doc', '_data', 'source_locs.csv'), index=False)

sensor_rr = np.array([mne.transforms.apply_trans(trans, ch['loc'][:3])
                      for ch in evoked.info['chs']])
pd.DataFrame(dict(zip(('L', 'I', 'A'), sensor_rr.T))).to_csv(
    op.join('doc', '_data', 'sensor_locs.csv'), index=False)

''' Too big and missing cerebellum and subcortical
pial_verts, pial_tris = mne.read_surface(op.join(
   subjects_dir, 'sample', 'surf', 'lh.pial'))'''

# brain surfaces, includes cerebellum and subcortical
aseg = nib.load(op.join(subjects_dir, 'sample', 'mri', 'aseg.mgz'))
aseg_data = np.asarray(aseg.dataobj)
vox_mri_t = aseg.header.get_vox2ras_tkr()
brain_rr, brain_tris = mne.surface._marching_cubes(
    aseg_data > 0, [1], smooth=0.9)[0]
brain_rr, brain_tris = mne.surface.decimate_surface(
    brain_rr, brain_tris, n_triangles=5120)
brain_rr = mne.transforms.apply_trans(vox_mri_t, brain_rr) / 1000
pd.DataFrame(dict(zip(('L', 'I', 'A'), brain_rr.T))).to_csv(
    op.join('doc', '_data', 'brain_verts.csv'), index=False)
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), brain_tris.T))).to_csv(
    op.join('doc', '_data', 'brain_tris.csv'), index=False)

''' Too big to render
lut, fs_colors = mne._freesurfer.read_freesurfer_lut()
lut_r = {v: k for k, v in lut.items()}
labels = [lut_r[idx] for idx in mne.defaults.DEFAULTS['volume_label_indices']]
labels += ['Left-Cerebral-White-Matter', 'Left-Cerebral-Cortex',
           'Right-Cerebral-White-Matter', 'Right-Cerebral-Cortex']
brain_surfs = mne.surface._marching_cubes(
    aseg_data, [lut[label] for label in labels], smooth=0.9)
for label, surf in zip(labels, brain_surfs):
    brain_rr, brain_tris = surf
    brain_rr = mne.transforms.apply_trans(vox_mri_t, brain_rr) / 1000
    pd.DataFrame(dict(zip(('L', 'I', 'A'), brain_rr.T))).to_csv(
        op.join('doc', '_data', 'brain_surfaces',
                label.lower() + '_verts.csv'), index=False)
    pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), brain_tris.T))).to_csv(
        op.join('doc', '_data', 'brain_surfaces',
                label.lower() + '_tris.csv'), index=False)

colors = np.array([fs_colors[label] / 255 for label in labels])
pd.DataFrame(dict(zip(('R', 'G', 'B'), colors[:, :3].T)),
             index=[label.lower() for label in labels]).to_csv(
    op.join('doc', '_data', 'brain_surface_colors.csv'))
'''

# MEG helmet surface
helmet = mne.surface.get_meg_helmet_surf(evoked.info, trans)
pd.DataFrame(dict(zip(('L', 'I', 'A'), helmet['rr'].T))).to_csv(
    op.join('doc', '_data', 'helmet_verts.csv'), index=False)
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), helmet['tris'].T))).to_csv(
    op.join('doc', '_data', 'helmet_tris.csv'), index=False)

# we need to know which type each channel is
ch_types = np.empty((len(fwd.ch_names),), dtype=object)
ch_types[mne.pick_types(fwd['info'], meg='grad')] = 'grad'
ch_types[mne.pick_types(fwd['info'], meg='mag')] = 'mag'
ch_types[mne.pick_types(fwd['info'], eeg=True)] = 'eeg'
pd.DataFrame(dict(ch_type=list(ch_types))).to_csv(
    op.join('doc', '_data', 'ch_types.csv'), index=False)

sensor_rr_flat = np.zeros((len(fwd.ch_names), 2)) * np.nan
for ch_type in ('grad', 'mag', 'eeg'):
    picks, pos, merge_channels, names, ch_type, sphere, clip_origin = \
        mne.viz.topomap._prepare_topomap_plot(evoked, ch_type)
    outlines = mne.viz.topomap._make_head_outlines(
        sphere, pos, outlines='head', clip_origin=clip_origin)
    if len(picks) != pos.shape[0]:  # grad, two channels in one place
        pos = np.ravel(np.column_stack((pos, pos))).reshape(-1, 2)
    for pick, ch_pos in zip(picks, pos):
        if evoked.ch_names[pick] in fwd.ch_names:
            sensor_rr_flat[fwd.ch_names.index(evoked.ch_names[pick])] = ch_pos
    for ol in ('head', 'nose', 'ear_left', 'ear_right', 'mask_pos'):
        pd.DataFrame(dict(x=outlines[ol][0], y=outlines[ol][1])).to_csv(
            op.join('doc', '_data', f'{ch_type}_{ol}_outlines.csv'),
            index=False)

assert not np.isnan(sensor_rr_flat).any()
pd.DataFrame(dict(zip(('x', 'y'), sensor_rr_flat.T))).to_csv(
    op.join('doc', '_data', 'sensor_flat_locs.csv'), index=False)


# %%
# Add template to the tutorial html:

# read in html output by sphinx
tut_fname = op.join('doc', '_build', 'html', 'auto_examples',
                    'plot_tutorial.html')
with open(tut_fname, 'r') as fid:
    tut_html = '\n'.join(fid.readlines())


# read in our template
with open(op.join('doc', '_templates', 'dipole_simulator.html'), 'r') as fid:
    sim_html = '\n'.join(fid.readlines())


# find the scripts section
idx = tut_html.index('<script')
# add our scripts
tut_html = tut_html[:idx] + """
    <script src="../../_js/gl-matrix-min.js" defer></script>
    <script src="../../_js/dipole_simulator.js" defer></script>
""" + tut_html[idx:]

# find the top of the main section where to insert
idx = tut_html.index('<main')
while tut_html[idx] != '>':
    idx += 1
idx += 10  # skip past one set of new lines
# add our canvas
tut_html = tut_html[:idx] + """
<canvas id="dipole_sim_canvas" width="640" height="480"></canvas>
""" + tut_html[idx:]

# write out the final tutorial html
with open(tut_fname, 'w') as fid:
    fid.write(tut_html)
