import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { mattersApi, usersApi } from '@/api/endpoints/identity';
import type { Matter, User } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';
import { Plus } from 'lucide-react';

export function IdentityManagementPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Identity Management</h2>
      <Tabs defaultValue="matters">
        <TabsList>
          <TabsTrigger value="matters">Matters</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="matters">
          <MattersTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MattersTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    matter_ref: '',
    display_name: '',
    client_name: '',
    practice_area: '',
    aliases: '',
  });
  const [editMatter, setEditMatter] = useState<Matter | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['matters'],
    queryFn: () => mattersApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      mattersApi.create({
        matter_ref: form.matter_ref,
        display_name: form.display_name,
        client_name: form.client_name || undefined,
        practice_area: form.practice_area || undefined,
        aliases: form.aliases ? form.aliases.split(',').map((s) => s.trim()) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matters'] });
      setForm({ matter_ref: '', display_name: '', client_name: '', practice_area: '', aliases: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Matter> }) =>
      mattersApi.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matters'] });
      setEditMatter(null);
    },
  });

  const columns: Column<Matter>[] = [
    { header: 'Ref', accessorKey: 'matter_ref' },
    { header: 'Name', accessorKey: 'display_name' },
    { header: 'Client', cell: (m) => m.client_name ?? '-' },
    { header: 'Practice Area', cell: (m) => m.practice_area ?? '-' },
    {
      header: 'Aliases',
      cell: (m) => m.aliases.length > 0 ? m.aliases.join(', ') : '-',
    },
    { header: 'Updated', cell: (m) => <DateDisplay date={m.updated_at} /> },
    {
      header: '',
      cell: (m) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditMatter(m); }}>
          Edit
        </Button>
      ),
      className: 'w-16',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3 w-3" /> Add Matter
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Matter</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Matter Ref</Label>
                <Input value={form.matter_ref} onChange={(e) => setForm({ ...form, matter_ref: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Client Name</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Practice Area</Label>
                <Input value={form.practice_area} onChange={(e) => setForm({ ...form, practice_area: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Aliases (comma-separated)</Label>
                <Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button onClick={() => createMutation.mutate()} disabled={!form.matter_ref || !form.display_name}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyTitle="No matters"
        emptyDescription="No matters registered yet."
      />

      {/* Edit dialog */}
      {editMatter && (
        <EditMatterDialog
          matter={editMatter}
          onClose={() => setEditMatter(null)}
          onSave={(updates) => updateMutation.mutate({ id: editMatter.id, updates })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function EditMatterDialog({
  matter,
  onClose,
  onSave,
  isPending,
}: {
  matter: Matter;
  onClose: () => void;
  onSave: (updates: Partial<Matter>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    display_name: matter.display_name,
    client_name: matter.client_name ?? '',
    practice_area: matter.practice_area ?? '',
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Matter: {matter.matter_ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Client Name</Label>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Practice Area</Label>
            <Input value={form.practice_area} onChange={(e) => setForm({ ...form, practice_area: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                display_name: form.display_name,
                client_name: form.client_name || null,
                practice_area: form.practice_area || null,
              } as Partial<Matter>)
            }
            disabled={isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    user_ref: '',
    display_name: '',
    email: '',
    role: '',
    department: '',
    aliases: '',
  });
  const [editUser, setEditUser] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        user_ref: form.user_ref,
        display_name: form.display_name,
        email: form.email || undefined,
        role: form.role || undefined,
        department: form.department || undefined,
        aliases: form.aliases ? form.aliases.split(',').map((s) => s.trim()) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setForm({ user_ref: '', display_name: '', email: '', role: '', department: '', aliases: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<User> }) =>
      usersApi.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    },
  });

  const columns: Column<User>[] = [
    { header: 'Ref', accessorKey: 'user_ref' },
    { header: 'Name', accessorKey: 'display_name' },
    { header: 'Email', cell: (u) => u.email ?? '-' },
    { header: 'Role', cell: (u) => u.role ?? '-' },
    { header: 'Department', cell: (u) => u.department ?? '-' },
    { header: 'Updated', cell: (u) => <DateDisplay date={u.updated_at} /> },
    {
      header: '',
      cell: (u) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditUser(u); }}>
          Edit
        </Button>
      ),
      className: 'w-16',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3 w-3" /> Add User
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>User Ref</Label>
                <Input value={form.user_ref} onChange={(e) => setForm({ ...form, user_ref: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Aliases (comma-separated)</Label>
                <Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button onClick={() => createMutation.mutate()} disabled={!form.user_ref || !form.display_name}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyTitle="No users"
        emptyDescription="No users registered yet."
      />

      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(updates) => updateMutation.mutate({ id: editUser.id, updates })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSave,
  isPending,
}: {
  user: User;
  onClose: () => void;
  onSave: (updates: Partial<User>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    display_name: user.display_name,
    email: user.email ?? '',
    role: user.role ?? '',
    department: user.department ?? '',
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User: {user.user_ref}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                display_name: form.display_name,
                email: form.email || null,
                role: form.role || null,
                department: form.department || null,
              } as Partial<User>)
            }
            disabled={isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
