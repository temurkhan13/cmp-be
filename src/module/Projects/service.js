const supabase = require("../../config/supabase");

const create = async (body) => {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      first_name: body.firstName,
      last_name: body.lastName,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert members if present
  if (body.members && Array.isArray(body.members)) {
    const members = body.members.map((userId) => ({
      project_id: data.id,
      user_id: userId,
    }));
    const { error: memError } = await supabase.from("project_members").insert(members);
    if (memError) throw memError;
  }

  return data;
};

module.exports = {
  create,
};
