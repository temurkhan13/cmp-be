-- Add sort_order column to playbook_stages for drag-and-drop reordering
ALTER TABLE playbook_stages
  ADD COLUMN sort_order INTEGER DEFAULT 0;
