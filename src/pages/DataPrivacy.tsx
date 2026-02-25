import { motion } from 'framer-motion';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Shield, Lock, Eye, EyeOff, Trash2, Clock, Database } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function DataPrivacy() {
  const { privacySettings, updatePrivacySettings, dataSets } = useDataStore();
  const { toast } = useToast();

  const handleSettingChange = (key: keyof typeof privacySettings, value: any) => {
    updatePrivacySettings({ [key]: value });
    toast({
      title: 'Setting updated',
      description: 'Your privacy settings have been saved.',
    });
  };

  const toggleExcludeColumn = (column: string) => {
    const newExcluded = privacySettings.excludeColumns.includes(column)
      ? privacySettings.excludeColumns.filter((c) => c !== column)
      : [...privacySettings.excludeColumns, column];
    handleSettingChange('excludeColumns', newExcluded);
  };

  // Get all unique columns from datasets
  const allColumns = [...new Set(dataSets.flatMap((ds) => ds.columns.map((c) => c.name)))];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Data Privacy <HelpTooltip text="Lindungi data sensitif dari AI. Aktifkan masking, anonymization, atau exclude kolom tertentu saat generate laporan AI." /></h1>
            <p className="text-muted-foreground">
              Protect your data from AI absorption
            </p>
          </div>
        </div>
      </motion.div>

      {/* Privacy Shield Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Data Protection Active</h3>
              <p className="text-muted-foreground">
                Your data is protected from AI training and external access
              </p>
            </div>
          </div>
          <Badge className="bg-success/20 text-success border-success/30 px-4 py-2">
            <Lock className="w-4 h-4 mr-2" />
            Protected
          </Badge>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <h3 className="text-lg font-semibold text-foreground mb-6">Core Protection Settings</h3>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <EyeOff className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="maskSensitive" className="text-foreground font-medium">
                    Mask Sensitive Data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Hide PII and sensitive information from AI
                  </p>
                </div>
              </div>
              <Switch
                id="maskSensitive"
                checked={privacySettings.maskSensitiveData}
                onCheckedChange={(checked) => handleSettingChange('maskSensitiveData', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="anonymize" className="text-foreground font-medium">
                    Anonymize Data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Replace identifiable info with pseudonyms
                  </p>
                </div>
              </div>
              <Switch
                id="anonymize"
                checked={privacySettings.anonymizeData}
                onCheckedChange={(checked) => handleSettingChange('anonymizeData', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="encrypt" className="text-foreground font-medium">
                    Encrypt at Rest
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Encrypt stored data for extra security
                  </p>
                </div>
              </div>
              <Switch
                id="encrypt"
                checked={privacySettings.encryptAtRest}
                onCheckedChange={(checked) => handleSettingChange('encryptAtRest', checked)}
              />
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="retention" className="text-foreground font-medium">
                    Data Retention (days)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Auto-delete data after this period
                  </p>
                </div>
              </div>
              <Input
                id="retention"
                type="number"
                value={privacySettings.dataRetentionDays}
                onChange={(e) => handleSettingChange('dataRetentionDays', parseInt(e.target.value) || 30)}
                className="w-32"
                min={1}
                max={365}
              />
            </div>
          </div>
        </motion.div>

        {/* Column Exclusions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Exclude Columns from AI
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Select columns that should never be sent to AI for analysis
          </p>
          
          {allColumns.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No datasets uploaded yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload data to configure column exclusions
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allColumns.map((column) => (
                <Badge
                  key={column}
                  variant={privacySettings.excludeColumns.includes(column) ? 'default' : 'outline'}
                  className="cursor-pointer transition-all"
                  onClick={() => toggleExcludeColumn(column)}
                >
                  {privacySettings.excludeColumns.includes(column) && (
                    <Lock className="w-3 h-3 mr-1" />
                  )}
                  {column}
                </Badge>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* AI Processing Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">
          How We Protect Your Data
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Shield,
              title: 'Data Isolation',
              description: 'Your data is processed in isolated environments that are destroyed after each session.',
            },
            {
              icon: Lock,
              title: 'No Training',
              description: 'AI models never learn from or retain your data. Each request is stateless.',
            },
            {
              icon: Trash2,
              title: 'Auto Deletion',
              description: 'Temporary data is automatically purged according to your retention settings.',
            },
          ].map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg gradient-success flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-success-foreground" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">{item.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
