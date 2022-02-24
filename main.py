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
import json
from shutil import copyfile

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
angles = mne.transforms._cart_to_sph(ico)[:, 1:]
# for the approximate angular step
# np.rad2deg(np.min(np.linalg.norm(angles[0] - angles[1:], axis=1)))
pd.DataFrame(dict(zip(('theta', 'phi'), angles[:, 1:].T))).to_csv(
    op.join('doc', '_data', 'angles.csv'), index=False)

n_dipoles = fwd['source_rr'].shape[0]
vertices = [fwd['src'][0]['vertno']]

# Would be used for inefficient equivalent computation below:
#   data = np.zeros((n_dipoles, 3, 1))
#   stc = mne.VolVectorSourceEstimate(data, vertices=vertices,
#                                     subject='sample', tmin=0, tstep=1)

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
        pd.DataFrame(evoked_data.flatten()).to_csv(op.join(
            'doc', '_data', 'dipole_data',
            f'vi-{vert_idx}_ai-{angle_idx}.csv'), header=False, index=False)


# surfaces and points
fwd_rr = fwd['source_rr']
fwd_rr = mne.transforms.apply_trans(trans, fwd_rr) * 1000
pd.DataFrame(dict(zip(('R', 'A', 'S'), fwd['source_rr'].T))).to_csv(
    op.join('doc', '_data', 'source_locs.csv'), index=False)

sensor_rr = np.array([mne.transforms.apply_trans(trans, ch['loc'][:3])
                      for ch in evoked.info['chs']])
pd.DataFrame(dict(zip(('R', 'A', 'S'), sensor_rr.T)),
             index=evoked.ch_names).to_csv(
    op.join('doc', '_data', 'sensor_locs.csv'))

for ch_type in ('grad', 'mag', 'eeg'):
    picks, pos, merge_channels, names, ch_type, sphere, clip_origin = \
        mne.viz.topomap._prepare_topomap_plot(evoked, ch_type)
    outlines = mne.viz.topomap._make_head_outlines(
        sphere, pos, outlines='head', clip_origin=clip_origin)
    if len(picks) != pos.shape[0]:  # grad, two channels in one place
        pos = np.ravel(np.column_stack((pos, pos))).reshape(-1, 2)
    pd.DataFrame(dict(zip(('x', 'y'), pos.T)),
                 index=[evoked.ch_names[idx] for idx in picks]).to_csv(
        op.join('doc', '_data', f'{ch_type}_sensors_flat.csv'))
    for ol in ('head', 'nose', 'ear_left', 'ear_right', 'mask_pos'):
        pd.DataFrame(dict(x=outlines[ol][0], y=outlines[ol][1])).to_csv(
            op.join('doc', '_data', f'{ch_type}_{ol}_outlines.csv'))


head = mne._freesurfer._get_head_surface(
    'head', 'sample', subjects_dir)  # could be seghead for better res
pd.DataFrame(dict(zip(('R', 'A', 'S'), head['rr'].T))).to_csv(
    op.join('doc', '_data', 'head_verts.csv'), index=False)
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), head['tris'].T))).to_csv(
    op.join('doc', '_data', 'head_tris.csv'), index=False)

aseg = nib.load(op.join(subjects_dir, 'sample', 'mri', 'aseg.mgz'))
aseg_data = np.asarray(aseg.dataobj)
vox_mri_t = aseg.header.get_vox2ras_tkr()
lut, fs_colors = mne._freesurfer.read_freesurfer_lut()
lut_r = {v: k for k, v in lut.items()}
labels = [lut_r[idx] for idx in mne.defaults.DEFAULTS['volume_label_indices']]
brain_surfs = mne.surface._marching_cubes(
    aseg_data, [lut[label] for label in labels], smooth=0.9)
brain_rr = np.concatenate([surf[0] for surf in brain_surfs])
brain_rr = mne.transforms.apply_trans(vox_mri_t, brain_rr)
brain_tris = np.concatenate([surf[1] for surf in brain_surfs])
# pial_verts, pial_tris = mne.read_surface(op.join(
#    subjects_dir, 'sample', 'surf', 'lh.pial'))
pd.DataFrame(dict(zip(('R', 'A', 'S'), brain_rr.T))).to_csv(
    op.join('doc', '_data', 'brain_verts.csv'), index=False)  # 4 MB
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), brain_tris.T))).to_csv(
    op.join('doc', '_data', 'brain_tris.csv'), index=False)

helmet = mne.surface.get_meg_helmet_surf(evoked.info, trans)
pd.DataFrame(dict(zip(('R', 'A', 'S'), helmet['rr'].T))).to_csv(
    op.join('doc', '_data', 'helmet_verts.csv'), index=False)
pd.DataFrame(dict(zip(('v1', 'v2', 'v3'), helmet['tris'].T))).to_csv(
    op.join('doc', '_data', 'helmet_tris.csv'), index=False)


# %%
# Add template to the tutorial html:

# read in html output by sphinx
tut_fname = op.join('doc', '_build', 'auto_examples', 'plot_tutorial.html')
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
    <script src="../../dipole_simulator.js" defer></script>
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
